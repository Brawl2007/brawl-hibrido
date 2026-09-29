/**
 * Brawl Híbrido e dois modelos locais inspirados nas definições públicas do
 * PL Prodigy e do MetaPick. As fórmulas completas dos sites não estão
 * confirmadas. Os pesos Masters+ abaixo e a regra de ban com inimigos ainda
 * por revelar foram verificados na interface do PL em 29/09/2026.
 *
 * A normalização por candidatos, a logística e a conversão de pp do MetaPick
 * são escolhas/estimativas deste projeto, não fórmulas oficiais. Conservam-se
 * para permitir comparar motores com os mesmos dados. Ver LEIA-ME-v166.md.
 */
import { getMatchupValue, sinergiaObservada, fonteObservadaAtiva } from "./counterMatchupValue";
import { getBrawlScopeSynergyTeammates } from "./counterSourceRelations";

export type MotorDoDraft = "hibrido" | "plprodigy" | "metapick";

export type PesosPLProdigy = { uso: number; vitoria: number; counter: number; encaixe: number; sinergia: number; ban: number };
/** Os valores por omissão do PL Prodigy (definições «PL Prodigy Settings», rank Masters+). */
export const PESOS_PL_PRODIGY: PesosPLProdigy = { uso: 4, vitoria: 20, counter: 40, encaixe: 13, sinergia: 10, ban: 13 };

/**
 * Presets lidos nas definições públicas do PL Prodigy em 29/09/2026.
 */
export const PRESETS_PL_PRODIGY: Record<"mestre" | "diamanteOuAbaixo", { nome: string; pesos: PesosPLProdigy }> = {
  mestre: { nome: "Masters+", pesos: PESOS_PL_PRODIGY },
  diamanteOuAbaixo: { nome: "Diamante e abaixo", pesos: { uso: 9, vitoria: 27, counter: 32, encaixe: 9, sinergia: 14, ban: 9 } },
};

/**
 * Escala local estimada a partir de dez exemplos da investigação anterior:
 *   total = 100 / (1 + e^(−5,22 × (raw − 0,30)))
 * Ajustar esses exemplos não confirma a fórmula privada do PL. A função
 * apenas muda a escala; não muda a ordem da soma ponderada local.
 */
export function escalaDoPLProdigy(raw: number) {
  return 100 / (1 + Math.exp(-5.22 * (raw - 0.3)));
}

export type AjustesMetaPick = { sinergia: number; counter: number; minSinergia: number; minCounter: number; penalizacaoBan: number; topCounters: number };
/** Os valores por omissão do MetaPick («Draft Tool Settings»). */
export const AJUSTES_METAPICK: AjustesMetaPick = { sinergia: 1.2, counter: 2.5, minSinergia: 0.2, minCounter: 0.2, penalizacaoBan: 0.5, topCounters: 5 };

export type ConfigDoMotor = { motor: MotorDoDraft; pl: PesosPLProdigy; meta: AjustesMetaPick };
export const CONFIG_DO_MOTOR: ConfigDoMotor = { motor: "hibrido", pl: PESOS_PL_PRODIGY, meta: AJUSTES_METAPICK };

/** O que cada motor precisa de saber de um candidato. */
export type ComponentesDoCandidato = {
  brawler: string;
  /** Score do mapa posto em pontos: o melhor do mapa vale 100. */
  base: number;
  vitoria: number | null;
  uso: number | null;
  /** Um valor por pick inimigo, na mesma ordem para todos: pp que ele ganha a mais (+) ou a menos (−). */
  counters: number[];
  /** Um valor por aliado já escolhido: pp que ganha a mais ao lado dele. */
  sinergias: number[];
  /** Encaixe da função no modo e na equipa, de 0 a 100. */
  encaixe: number;
  /** Quantos dos counters dele estão banidos. */
  countersBanidos: number;
  /** Força (pp) dos counters dele que o adversário ainda pode escolher, do mais forte para o mais fraco. */
  riscos: number[];
};

export type PontuacaoDoMotor = { brawler: string; pontos: number; partes: Array<{ nome: string; valor: number }> };

export type RelacaoDoMotor = { brawler: string; pp: number };
export type ContextoDoMotor = {
  counters: RelacaoDoMotor[];
  sinergias: RelacaoDoMotor[];
  countersBanidos: string[];
  riscos: RelacaoDoMotor[];
  inimigosPorRevelar: number;
};

/** Lê os dados do motor escolhido sem herdar as janelas Top 25/30 do Híbrido. */
export function lerContextoDoMotor(brawler: string, contexto: {
  inimigos: readonly string[];
  aliados: readonly string[];
  bans: Iterable<string>;
  roster: readonly string[];
  bloqueados: Iterable<string>;
  modeId?: string;
  incluirRiscos: boolean;
}): ContextoDoMotor {
  const chave = (nome: string) => nome.toLowerCase().replace(/[^a-z0-9]/g, "");
  const unicos = (nomes: Iterable<string>) => [...new Map(Array.from(nomes, (nome) => [chave(nome), nome])).values()];
  const inimigos = unicos(contexto.inimigos);
  const bans = unicos(contexto.bans);
  const inimigosPorRevelar = Math.max(0, 3 - inimigos.length);
  const indisponiveis = new Set(Array.from([
    ...contexto.bloqueados, ...bans, ...inimigos, ...contexto.aliados, brawler,
  ], chave));
  return {
    counters: inimigos.map((nome) => ({ brawler: nome, pp: confrontoEntre(brawler, nome, contexto.modeId) })),
    sinergias: unicos(contexto.aliados).map((nome) => ({ brawler: nome, pp: sinergiaEntre(brawler, nome, contexto.modeId) })),
    // Regra pública do PL: só antes de conhecer a equipa inimiga completa.
    countersBanidos: inimigosPorRevelar > 0
      ? bans.filter((nome) => confrontoEntre(brawler, nome, contexto.modeId) < 0)
      : [],
    // Perspetiva do candidato: perdas face à SUA vitória habitual. A vitória
    // extra do adversário tem outra base e não é necessariamente o inverso.
    riscos: !contexto.incluirRiscos || inimigosPorRevelar === 0 ? [] : unicos(contexto.roster)
      .filter((nome) => !indisponiveis.has(chave(nome)))
      .map((nome) => ({ brawler: nome, pp: -confrontoEntre(brawler, nome, contexto.modeId) }))
      .filter((relacao) => relacao.pp > 0)
      .sort((a, b) => b.pp - a.pp || a.brawler.localeCompare(b.brawler))
      .slice(0, inimigosPorRevelar),
    inimigosPorRevelar,
  };
}

const soma = (valores: readonly number[]) => valores.reduce((total, valor) => total + valor, 0);

/** Põe uma parte de 0 a 100 entre os candidatos; sem diferenças, todos ficam a 50. */
function normalizar(valores: ReadonlyArray<number | null>) {
  const bons = valores.filter((valor): valor is number => valor !== null && Number.isFinite(valor));
  const minimo = bons.length ? Math.min(...bons) : 0;
  const maximo = bons.length ? Math.max(...bons) : 0;
  return valores.map((valor) => {
    if (valor === null || !Number.isFinite(valor)) return 0;
    return maximo === minimo ? 50 : ((valor - minimo) / (maximo - minimo)) * 100;
  });
}

/** Sem confrontos/sinergias/bans ativos, a parte não dá um bónus fictício de 50. */
const normalizarContexto = (valores: readonly number[]) => valores.every((valor) => valor === 0)
  ? valores.map(() => 0)
  : normalizar(valores);

export function pontuarComoPLProdigy(candidatos: readonly ComponentesDoCandidato[], pesos: PesosPLProdigy = PESOS_PL_PRODIGY): PontuacaoDoMotor[] {
  // Mapas só com o Score publicado (sem vitória nem uso): o Score do mapa faz as vezes dos dois.
  const semVitoria = candidatos.every((c) => c.vitoria === null);
  const semUso = candidatos.every((c) => c.uso === null);
  const partes = {
    uso: normalizar(candidatos.map((c) => (semUso ? c.base : c.uso))),
    vitoria: normalizar(candidatos.map((c) => (semVitoria ? c.base : c.vitoria))),
    counter: normalizarContexto(candidatos.map((c) => soma(c.counters))),
    encaixe: normalizar(candidatos.map((c) => c.encaixe)),
    sinergia: normalizarContexto(candidatos.map((c) => soma(c.sinergias))),
    ban: normalizarContexto(candidatos.map((c) => c.countersBanidos)),
  };
  const nomes: Record<keyof PesosPLProdigy, string> = { uso: "Uso", vitoria: "Vitória", counter: "Counter", encaixe: "Encaixe", sinergia: "Sinergia", ban: "Ban" };
  const chaves = Object.keys(nomes) as Array<keyof PesosPLProdigy>;
  const totalDosPesos = soma(chaves.map((chave) => Math.max(0, pesos[chave]))) || 1;
  return candidatos.map((candidato, i) => {
    const contribuicoes = chaves.map((chave) => ({ nome: nomes[chave], valor: (Math.max(0, pesos[chave]) * partes[chave][i]) / totalDosPesos }));
    // As partes somam o valor bruto local (em %), antes da escala estimada.
    return { brawler: candidato.brawler, pontos: escalaDoPLProdigy(soma(contribuicoes.map((parte) => parte.valor)) / 100), partes: contribuicoes };
  });
}

export function pontuarComoMetaPick(candidatos: readonly ComponentesDoCandidato[], ajustes: AjustesMetaPick = AJUSTES_METAPICK): PontuacaoDoMotor[] {
  const unidade = (pp: number) => pp / 10;
  // Para cada inimigo, só os «Top Counter Limit» melhores counters recebem o bónus.
  const inimigos = Math.max(0, ...candidatos.map((c) => c.counters.length));
  const noTopo = Array.from({ length: inimigos }, (_, j) => new Set(
    candidatos
      .map((c, i) => ({ i, valor: c.counters[j] ?? 0 }))
      .filter((entrada) => entrada.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, Math.max(0, Math.round(ajustes.topCounters)))
      .map((entrada) => entrada.i),
  ));
  return candidatos.map((candidato, i) => {
    const counter = soma(candidato.counters.map((pp, j) => {
      const valor = unidade(pp);
      if (Math.abs(valor) < ajustes.minCounter) return 0;
      if (valor > 0 && !noTopo[j]?.has(i)) return 0;
      return valor;
    }));
    const sinergia = soma(candidato.sinergias.map(unidade).filter((valor) => Math.abs(valor) >= ajustes.minSinergia));
    const risco = soma(candidato.riscos.map(unidade));
    const partes = [
      { nome: "Base", valor: candidato.base },
      { nome: "Counter", valor: 10 * ajustes.counter * counter },
      { nome: "Sinergia", valor: 10 * ajustes.sinergia * sinergia },
      { nome: "Risco", valor: -10 * ajustes.penalizacaoBan * risco },
    ];
    return { brawler: candidato.brawler, pontos: soma(partes.map((parte) => parte.valor)), partes };
  });
}

export function pontuarComMotor(candidatos: readonly ComponentesDoCandidato[], config: ConfigDoMotor) {
  if (config.motor === "plprodigy") return pontuarComoPLProdigy(candidatos, config.pl);
  if (config.motor === "metapick") return pontuarComoMetaPick(candidatos, config.meta);
  return null;
}

/** A sinergia entre dois aliados: a da API com «API oficial», senão o «Pair with» do BrawlScope (as duas fichas). */
export function sinergiaEntre(candidato: string, aliado: string, modeId?: string) {
  if (fonteObservadaAtiva()) return sinergiaObservada(candidato, aliado) ?? 0;
  const mesmo = (a: string, b: string) => a.toLocaleLowerCase("en") === b.toLocaleLowerCase("en");
  const valores = [
    getBrawlScopeSynergyTeammates(candidato, modeId, true).find((relacao) => mesmo(relacao.brawler, aliado))?.delta,
    getBrawlScopeSynergyTeammates(aliado, modeId, true).find((relacao) => mesmo(relacao.brawler, candidato))?.delta,
  ].filter((valor): valor is number => typeof valor === "number");
  return valores.length ? soma(valores) / valores.length : 0;
}

/** Quanto `candidato` ganha a mais contra `inimigo` (pp), com as fontes ou a API — o mesmo número do Draft. */
export function confrontoEntre(candidato: string, inimigo: string, modeId?: string) {
  const valor = getMatchupValue(candidato, inimigo, modeId);
  return valor.base === null ? 0 : valor.total;
}

/** Limites de cada barra: os do MetaPick são os do código público do site (investigação de 29/09/2026). */
export const LIMITES_PL_PRODIGY = { min: 0, max: 100, passo: 1 } as const;
export const LIMITES_METAPICK: Record<keyof AjustesMetaPick, { min: number; max: number; passo: number }> = {
  sinergia: { min: 0, max: 3, passo: 0.05 },
  counter: { min: 0, max: 4, passo: 0.05 },
  minSinergia: { min: 0, max: 1, passo: 0.05 },
  minCounter: { min: 0, max: 1, passo: 0.05 },
  penalizacaoBan: { min: 0, max: 1, passo: 0.05 },
  topCounters: { min: 1, max: 7, passo: 1 },
};

const limitar = (valor: unknown, min: number, max: number, omissao: number) =>
  typeof valor === "number" && Number.isFinite(valor) ? Math.min(max, Math.max(min, valor)) : omissao;

/** Lê a configuração guardada no navegador; qualquer valor estragado volta ao de omissão. */
export function lerConfigDoMotor(texto: string | null | undefined): ConfigDoMotor {
  let lido: Partial<{ motor: unknown; pl: Record<string, unknown>; meta: Record<string, unknown> }> = {};
  try {
    const objeto = texto ? JSON.parse(texto) : {};
    if (objeto && typeof objeto === "object") lido = objeto;
  } catch {
    lido = {};
  }
  const motor: MotorDoDraft = lido.motor === "plprodigy" || lido.motor === "metapick" ? lido.motor : "hibrido";
  const pl = Object.fromEntries((Object.keys(PESOS_PL_PRODIGY) as Array<keyof PesosPLProdigy>).map((chave) => [
    chave,
    limitar(lido.pl?.[chave], LIMITES_PL_PRODIGY.min, LIMITES_PL_PRODIGY.max, PESOS_PL_PRODIGY[chave]),
  ])) as PesosPLProdigy;
  const meta = Object.fromEntries((Object.keys(AJUSTES_METAPICK) as Array<keyof AjustesMetaPick>).map((chave) => [
    chave,
    limitar(lido.meta?.[chave], LIMITES_METAPICK[chave].min, LIMITES_METAPICK[chave].max, AJUSTES_METAPICK[chave]),
  ])) as AjustesMetaPick;
  return { motor, pl, meta };
}
