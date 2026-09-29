/**
 * Os motores do Draft: o do Brawl Híbrido, e dois que imitam o PL Prodigy e o
 * MetaPick, escolhidos nos Ajustes.
 *
 * POR QUE EXISTE
 *
 * O Brawl Híbrido MULTIPLICA: Score do mapa × (1 + bónus). O counter vale uma
 * percentagem da base, e um brawler fraco no mapa quase nunca sobe ao topo só
 * por countrar. O PL Prodigy e o MetaPick SOMAM, com o counter a pesar muito —
 * e é por isso que recomendam coisas que o Brawl Híbrido deixa em 60.º.
 *
 * Nenhum dos dois publica a fórmula: as contas são feitas no servidor deles.
 * A investigação de 29/09/2026 (pedidos que as próprias páginas fazem)
 * confirmou os dados de entrada (mapa, picks de cada lado, bans e os pesos),
 * os valores por omissão, os limites das barras do MetaPick, o preset
 * «Diamante e abaixo» do PL Prodigy e a escala dos pontos do PL (ver
 * `escalaDoPLProdigy`). Confirmou também que, no PL, banir os melhores sobe
 * os pontos dos outros — os pontos são relativos aos candidatos que sobram,
 * como a normalização abaixo. O resto segue os nomes das barras, com os dados
 * deste site — as fontes, ou as partidas da API com «API oficial» ligado:
 *
 * PL Prodigy — soma pesada de seis partes, cada uma posta de 0 a 100 entre os
 * candidatos do mapa: Uso 5%, Vitória 23%, Counter 36%, Encaixe 12%,
 * Sinergia 12%, Ban 12% (preset Masters+; há o de Diamante e abaixo). A soma
 * pesada é o «rawScore» e os pontos passam pela escala do PL.
 *   - Counter: soma do confronto contra cada pick inimigo.
 *   - Sinergia: soma da sinergia com cada aliado já escolhido.
 *   - Encaixe: a função dele no modo do mapa e na equipa (o «fit» do Draft).
 *   - Ban: quantos dos counters dele estão banidos. As fontes não publicam a
 *     taxa de ban de cada brawler; isto é o que o draft em curso diz.
 *
 * MetaPick — força no mapa + bónus somados, com limites de ruído:
 *   pontos = base + 10 × (Counter × C + Sinergia × S − Ban × R)
 *   - C: confrontos contra os picks inimigos, em dezenas de pontos
 *     percentuais (+10 pp = 1,0). Só conta |valor| ≥ Mín. Counter, e o bónus
 *     só vale para os «Top Counter Limit» melhores counters de cada inimigo.
 *   - S: sinergia com os aliados, na mesma unidade, com Mín. Sinergia.
 *   - R: risco — os counters dele que o adversário ainda pode escolher (os
 *     mais fortes, até ao número de picks que lhe faltam).
 */
import { getMatchupValue, sinergiaObservada, fonteObservadaAtiva } from "./counterMatchupValue";
import { getBrawlScopeSynergyTeammates } from "./counterSourceRelations";

export type MotorDoDraft = "hibrido" | "plprodigy" | "metapick";

export type PesosPLProdigy = { uso: number; vitoria: number; counter: number; encaixe: number; sinergia: number; ban: number };
/** Os valores por omissão do PL Prodigy (definições «PL Prodigy Settings», rank Masters+). */
export const PESOS_PL_PRODIGY: PesosPLProdigy = { uso: 5, vitoria: 23, counter: 36, encaixe: 12, sinergia: 12, ban: 12 };

/**
 * Os presets do PL Prodigy, por rank. O de Masters+ vem das definições do
 * site; o «diamond_below» é o que o próprio site enviou no pedido ao servidor
 * durante a investigação de 29/09/2026 (useRate 9, winRate 27, counterRate 32,
 * fitRate 9, synergyRate 14, banRate 9).
 */
export const PRESETS_PL_PRODIGY: Record<"mestre" | "diamanteOuAbaixo", { nome: string; pesos: PesosPLProdigy }> = {
  mestre: { nome: "Masters+", pesos: PESOS_PL_PRODIGY },
  diamanteOuAbaixo: { nome: "Diamante e abaixo", pesos: { uso: 9, vitoria: 27, counter: 32, encaixe: 9, sinergia: 14, ban: 9 } },
};

/**
 * A escala dos pontos do PL Prodigy: o servidor devolve um `rawScore` (0 a 1)
 * e um `totalScore` (0 a 100) que não é 100 × raw. Os dez pares publicados na
 * investigação (97 ← 0,9938; 81 ← 0,5782; … 54 ← 0,3341) batem todos, a menos
 * de 0,5 pontos (arredondamento), com uma logística:
 *   total = 100 / (1 + e^(−5,22 × (raw − 0,30)))
 * Deduzida dos números, não publicada — mas não muda a ordem, só a escala.
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

export function pontuarComoPLProdigy(candidatos: readonly ComponentesDoCandidato[], pesos: PesosPLProdigy = PESOS_PL_PRODIGY): PontuacaoDoMotor[] {
  // Mapas só com o Score publicado (sem vitória nem uso): o Score do mapa faz as vezes dos dois.
  const semVitoria = candidatos.every((c) => c.vitoria === null);
  const semUso = candidatos.every((c) => c.uso === null);
  const partes = {
    uso: normalizar(candidatos.map((c) => (semUso ? c.base : c.uso))),
    vitoria: normalizar(candidatos.map((c) => (semVitoria ? c.base : c.vitoria))),
    counter: normalizar(candidatos.map((c) => soma(c.counters))),
    encaixe: normalizar(candidatos.map((c) => c.encaixe)),
    sinergia: normalizar(candidatos.map((c) => soma(c.sinergias))),
    ban: normalizar(candidatos.map((c) => c.countersBanidos)),
  };
  const nomes: Record<keyof PesosPLProdigy, string> = { uso: "Uso", vitoria: "Vitória", counter: "Counter", encaixe: "Encaixe", sinergia: "Sinergia", ban: "Ban" };
  const chaves = Object.keys(nomes) as Array<keyof PesosPLProdigy>;
  const totalDosPesos = soma(chaves.map((chave) => Math.max(0, pesos[chave]))) || 1;
  return candidatos.map((candidato, i) => {
    const contribuicoes = chaves.map((chave) => ({ nome: nomes[chave], valor: (Math.max(0, pesos[chave]) * partes[chave][i]) / totalDosPesos }));
    // As partes somam o «rawScore» (em %); os pontos mostrados passam pela escala do site.
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
      { nome: "Ban", valor: -10 * ajustes.penalizacaoBan * risco },
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
