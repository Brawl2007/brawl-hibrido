/**
 * A configuração do motor do Draft com «API oficial» (v183).
 *
 * POR QUE EXISTE
 *
 * Até à v182, com a API ligada só se podia mexer em Vitória/Uso/Counter/
 * Sinergia por pick (chaves partilhadas com o Híbrido) e no peso do ban. Os
 * restantes bônus e desbônus — hard-counter, risco de resposta, equilíbrio da
 * equipa, bans, proteção — estavam escritos no código como números fixos.
 *
 * Aqui cada um desses números é uma regra com nome, limites e valor de
 * fábrica. Os valores de fábrica SÃO os da v181: sem mexer em nada, o motor dá
 * os mesmos resultados de antes (há testes que o garantem).
 *
 * COMO SE LÊ
 *
 *  - `picks`: a distribuição de cada pick, em %. Vitória e Uso repartem a força
 *    do mapa; Counter e Sinergia ganham espaço conforme o draft avança. Cada
 *    linha soma 100.
 *  - `forcas`: um multiplicador (0 = desligado, 1 = como está, até 3) para cada
 *    bônus e desbônus. «Counterado» é o desbônus de quando um inimigo já
 *    escolhido countera o candidato; «Counter» é o bônus de ele contra-atacar.
 *  - as restantes secções afinam o cálculo de cada bônus ou desbônus.
 */
import { defaultDraftRuleSettings, type DraftRuleSettings } from "./draftRules";

export type DistribuicaoDoPick = { vitoria: number; uso: number; counter: number; sinergia: number };
export const CAMPOS_DO_PICK = ["vitoria", "uso", "counter", "sinergia"] as const satisfies readonly (keyof DistribuicaoDoPick)[];

export type ConfigDoMotorApi = {
  picks: DistribuicaoDoPick[];
  forcas: {
    counter: number; counterado: number; sinergia: number; antiSinergia: number;
    hardCounter: number; risco: number; composicao: number;
    alivioBan: number; escassez: number; protecao: number; respostaTatica: number;
  };
  counter: {
    /** Peso do saldo de counters sobre a força do mapa (sempre foi 1,35). */
    peso: number;
    /** 0–1: quanto o bônus cai quando um aliado já countera aquele inimigo. 0 = desligado. */
    coberto: number;
    /** 0–2: quanto o desbônus agrava quando o inimigo que countera o candidato também countera um aliado. 0 = desligado. */
    pressaoPorAliado: number;
  };
  hardCounter: {
    /** Multiplica o quadrado da desvantagem contra cada inimigo escolhido. */
    fator: number;
    /** Acréscimo fixo quando um counter forte e comprovado já está na mesa. */
    veto: number;
    /** 1: a escolha fica marcada «não recomendada» e desce para o fim da lista. */
    bloquear: number;
  };
  risco: {
    /** Peso do risco de um counter qualquer, pesado pelo uso (escolha às cegas). */
    cego: number;
    /** Peso da melhor resposta que o adversário ainda pode escolher. */
    resposta: number;
    /** Quantos dos brawlers mais ameaçadores se consideram. */
    ameacas: number;
  };
  composicao: { funcoes: number; classe: number; paredes: number; antiTanque: number; cofre: number };
  bans: {
    /** Quanto um counter banido vale (a antiga «influência dos bans»). */
    peso: number;
    /** Teto do alívio, em fração da força do mapa. */
    tetoAlivio: number;
    /** Teto, em log-odds, do bônus de função escassa. */
    tetoEscassez: number;
    /** Teto do mesmo bônus, em fração da força do mapa. */
    tetoEscassezBase: number;
  };
  protecao: { teto: number; fator: number };
  respostaTatica: { abrirParedes: number; ultimoTank: number; ultimoLancador: number; teto: number };
  tetoDosBonus: {
    /** 1: a soma dos bônus tem um teto por pick. */
    ativo: number;
    /** Teto mínimo (log-odds) dos bônus nos picks 4–6. */
    minimoNoFecho: number;
    /** Teto por pick, em múltiplos da força do mapa. */
    proporcao: number[];
  };
  viabilidade: {
    tamanhoDoGrupo: number;
    usoMinimo: number;
    vitoriaMinima: number;
    /** Abaixo deste uso (razão à média) um brawler é «nicho». */
    nichoUso: number;
    bloquearNicho: number;
    bloquearForaDoMapa: number;
  };
  /** Jogos imaginários que puxam cada par para o esperado (K de N/(N+K)). */
  confianca: { counter: number; dupla: number; trio: number };
  /** Os bans sugeridos: presença^expoente × (força + peso × ameaça à escolha pretendida). */
  bansSugeridos: { expoentePresenca: number; pesoAmeaca: number };
};

const BASE_DA_PARTICIPACAO = [1, 0.92, 0.84, 0.76, 0.68, 0.6];

/**
 * A distribuição que o motor da API deriva das regras por pick (Vitória, Counter
 * e Sinergia). Serve a fábrica e a migração de quem já tinha pesos guardados.
 */
export function picksAPartirDasRegras(regras: Partial<DraftRuleSettings> = defaultDraftRuleSettings): DistribuicaoDoPick[] {
  const r = { ...defaultDraftRuleSettings, ...regras } as DraftRuleSettings;
  return [1, 2, 3, 4, 5, 6].map((n) => {
    const base = BASE_DA_PARTICIPACAO[n - 1];
    const counter = r[`counterPick${n}` as keyof typeof r] as number;
    const sinergia = r[`synergyPick${n}` as keyof typeof r] as number;
    const vitoria = r[`winRatePick${n}` as keyof typeof r] as number;
    const total = base + counter + sinergia;
    const mapa = base / total;
    return { vitoria: 100 * mapa * vitoria, uso: 100 * mapa * (1 - vitoria), counter: (100 * counter) / total, sinergia: (100 * sinergia) / total };
  });
}

export function configDeFabrica(): ConfigDoMotorApi {
  return {
    picks: picksAPartirDasRegras(),
    forcas: { counter: 1, counterado: 1, sinergia: 1, antiSinergia: 1, hardCounter: 1, risco: 1, composicao: 1, alivioBan: 1, escassez: 1, protecao: 1, respostaTatica: 1 },
    counter: { peso: 1.35, coberto: 0, pressaoPorAliado: 0 },
    hardCounter: { fator: 2.6, veto: 0.65, bloquear: 1 },
    risco: { cego: 2.8, resposta: 0.45, ameacas: 15 },
    composicao: { funcoes: 1, classe: 1, paredes: 1, antiTanque: 1, cofre: 1 },
    bans: { peso: 0.5, tetoAlivio: 0.3, tetoEscassez: 0.06, tetoEscassezBase: 0.1 },
    protecao: { teto: 0.35, fator: 0.5 },
    respostaTatica: { abrirParedes: 0.12, ultimoTank: 0.15, ultimoLancador: 0.15, teto: 0.25 },
    tetoDosBonus: { ativo: 1, minimoNoFecho: 0.18, proporcao: [3 / 7, 0.65, 1, 1.5, 2, 3] },
    viabilidade: { tamanhoDoGrupo: 25, usoMinimo: 0.35, vitoriaMinima: 0.44, nichoUso: 0.3, bloquearNicho: 1, bloquearForaDoMapa: 1 },
    confianca: { counter: 15, dupla: 25, trio: 40 },
    bansSugeridos: { expoentePresenca: 0.45, pesoAmeaca: 2.2 },
  };
}

export const CONFIG_PADRAO: Readonly<ConfigDoMotorApi> = Object.freeze(configDeFabrica());

/* ---- descritores: alimentam a normalização e o painel ---- */

export type SecaoEscalar = Exclude<keyof ConfigDoMotorApi, "picks">;
export type FormatoDoCampo = "forca" | "pct" | "numero" | "inteiro" | "interruptor";
export type CampoDaConfig = {
  secao: SecaoEscalar;
  campo: string;
  nome: string;
  ajuda: string;
  min: number;
  max: number;
  passo: number;
  formato: FormatoDoCampo;
};

const f = (secao: SecaoEscalar, campo: string, nome: string, ajuda: string, min: number, max: number, passo: number, formato: FormatoDoCampo): CampoDaConfig =>
  ({ secao, campo, nome, ajuda, min, max, passo, formato });

export const GRUPOS_DA_CONFIG = [
  { id: "bonus", titulo: "Bônus" },
  { id: "desbonus", titulo: "Desbônus" },
  { id: "bans", titulo: "Bans" },
  { id: "viabilidade", titulo: "Quem pode ser recomendado" },
  { id: "avancado", titulo: "Confiança e tetos" },
] as const;
export type GrupoDaConfig = (typeof GRUPOS_DA_CONFIG)[number]["id"];

export const CAMPOS_DA_CONFIG: Array<CampoDaConfig & { grupo: GrupoDaConfig }> = [
  // Bônus
  { ...f("forcas", "counter", "Counter", "Bônus quando ele ganha de um inimigo já escolhido, acima do que a força dos dois explica. 0 desliga; 1 é o valor de fábrica.", 0, 3, 0.05, "forca"), grupo: "bonus" },
  { ...f("counter", "peso", "Peso do saldo de counters", "Quanto o saldo de counters (bônus menos desbônus) pesa sobre a força do mapa. De fábrica 1,35.", 0, 4, 0.05, "numero"), grupo: "bonus" },
  { ...f("forcas", "sinergia", "Sinergia", "Bônus quando a dupla ou o trio com os aliados já escolhidos ganha mais do que o esperado.", 0, 3, 0.05, "forca"), grupo: "bonus" },
  { ...f("forcas", "alivioBan", "Caminho livre pelos bans", "Bônus quando os counters dele foram banidos. Cai a 2/3, 1/3 e 0 conforme os inimigos aparecem.", 0, 3, 0.05, "forca"), grupo: "bonus" },
  { ...f("forcas", "escassez", "Função escassa após bans", "Bônus quando os bans tiraram opções da função que a equipa ainda precisa (Mid ou Lane).", 0, 3, 0.05, "forca"), grupo: "bonus" },
  { ...f("forcas", "protecao", "Proteção do aliado", "Bônus quando ele protege um aliado frágil dos assassinos e tanques ainda disponíveis (picks 2–5).", 0, 3, 0.05, "forca"), grupo: "bonus" },
  { ...f("forcas", "respostaTatica", "Resposta à composição", "Bônus por abrir paredes usadas pelo inimigo e por explorar, no último pick, uma equipa sem anti-tanque ou sem invasor.", 0, 3, 0.05, "forca"), grupo: "bonus" },
  { ...f("counter", "coberto", "Counter já coberto", "Corta o bônus de counter contra um inimigo que um aliado já countera (a não ser que ele responda a dois inimigos). 0 = desligado.", 0, 1, 0.05, "pct"), grupo: "bonus" },
  // Desbônus
  { ...f("forcas", "counterado", "Counterado", "Desbônus quando um inimigo já escolhido countera ele — o counter dele já está na mesa.", 0, 3, 0.05, "forca"), grupo: "desbonus" },
  { ...f("forcas", "hardCounter", "Hard-counter", "Desbônus extra, ao quadrado, para confrontos muito desfavoráveis contra um inimigo já escolhido.", 0, 3, 0.05, "forca"), grupo: "desbonus" },
  { ...f("hardCounter", "fator", "Força do hard-counter", "Multiplica o quadrado da desvantagem. De fábrica 2,6.", 0, 6, 0.1, "numero"), grupo: "desbonus" },
  { ...f("hardCounter", "veto", "Acréscimo do veto", "Desbônus fixo quando um counter forte e comprovado já está na mesa. De fábrica 0,65.", 0, 2, 0.05, "numero"), grupo: "desbonus" },
  { ...f("hardCounter", "bloquear", "Marcar «não recomendado»", "Com hard-counter forte comprovado, a escolha desce para o fim da lista. Desligado, só perde pontos.", 0, 1, 1, "interruptor"), grupo: "desbonus" },
  { ...f("forcas", "antiSinergia", "Anti-sinergia", "Desbônus quando a dupla ou o trio com os aliados ganha menos do que o esperado.", 0, 3, 0.05, "forca"), grupo: "desbonus" },
  { ...f("forcas", "risco", "Risco de counter futuro", "Desbônus pelos counters dele que o adversário ainda pode escolher, pesados pelo uso.", 0, 3, 0.05, "forca"), grupo: "desbonus" },
  { ...f("risco", "cego", "Risco às cegas", "Peso do risco de qualquer counter possível. De fábrica 2,8.", 0, 6, 0.1, "numero"), grupo: "desbonus" },
  { ...f("risco", "resposta", "Pior resposta do adversário", "Peso da melhor resposta que o adversário ainda pode escolher. De fábrica 0,45.", 0, 2, 0.05, "numero"), grupo: "desbonus" },
  { ...f("counter", "pressaoPorAliado", "Pressão por aliado", "Agrava o desbônus quando o inimigo que countera ele também countera um aliado. 0 = desligado.", 0, 2, 0.05, "numero"), grupo: "desbonus" },
  { ...f("forcas", "composicao", "Equilíbrio da equipa", "Desbônus por faltar Mid ou lane, repetir classe, ficar sem anti-tanque ou sem dano ao cofre, ou depender de paredes que vão abrir.", 0, 3, 0.05, "forca"), grupo: "desbonus" },
  { ...f("composicao", "funcoes", "· Falta de Mid ou lane", "Só esta parte do equilíbrio da equipa.", 0, 3, 0.05, "forca"), grupo: "desbonus" },
  { ...f("composicao", "classe", "· Mesma classe", "Só esta parte do equilíbrio da equipa.", 0, 3, 0.05, "forca"), grupo: "desbonus" },
  { ...f("composicao", "paredes", "· Paredes e lançadores", "Só esta parte do equilíbrio da equipa.", 0, 3, 0.05, "forca"), grupo: "desbonus" },
  { ...f("composicao", "antiTanque", "· Dano contra tanques", "Só esta parte do equilíbrio da equipa.", 0, 3, 0.05, "forca"), grupo: "desbonus" },
  { ...f("composicao", "cofre", "· Dano ao cofre (Roubo)", "Só esta parte do equilíbrio da equipa.", 0, 3, 0.05, "forca"), grupo: "desbonus" },
  // Bans
  { ...f("bans", "peso", "Influência dos bans", "Quanto um counter banido vale. De fábrica 0,5: era só uma ameaça possível.", 0, 3, 0.05, "numero"), grupo: "bans" },
  { ...f("bans", "tetoAlivio", "Teto do caminho livre", "Fração máxima da força do mapa que o alívio dos bans pode somar.", 0, 1, 0.05, "pct"), grupo: "bans" },
  { ...f("bans", "tetoEscassez", "Teto da função escassa", "Máximo, em log-odds, do bônus de função escassa. De fábrica 0,06.", 0, 0.3, 0.01, "numero"), grupo: "bans" },
  { ...f("bansSugeridos", "expoentePresenca", "Ban sugerido: peso da presença", "Os bans sugeridos valem presença^este expoente × (força + peso × ameaça).", 0, 2, 0.05, "numero"), grupo: "bans" },
  { ...f("bansSugeridos", "pesoAmeaca", "Ban sugerido: peso da ameaça", "Quanto pesa ser counter da escolha pretendida.", 0, 6, 0.1, "numero"), grupo: "bans" },
  // Viabilidade
  { ...f("viabilidade", "tamanhoDoGrupo", "Tamanho do grupo viável", "Quantos brawlers do mapa se consideram viáveis. De fábrica 25.", 1, 60, 1, "inteiro"), grupo: "viabilidade" },
  { ...f("viabilidade", "usoMinimo", "Uso mínimo para entrar no grupo", "Razão do uso à média do mapa. De fábrica 0,35.", 0, 2, 0.05, "numero"), grupo: "viabilidade" },
  { ...f("viabilidade", "vitoriaMinima", "Vitória mínima para entrar no grupo", "De fábrica 44%.", 0.3, 0.6, 0.01, "pct"), grupo: "viabilidade" },
  { ...f("viabilidade", "nichoUso", "Limite de «nicho»", "Abaixo deste uso (razão à média) o brawler só é recomendado no fechamento, com dois counters fortes. De fábrica 0,30.", 0, 1, 0.05, "numero"), grupo: "viabilidade" },
  { ...f("viabilidade", "bloquearNicho", "Bloquear nichos", "Desligado, os nichos só perdem pontos pelas outras regras.", 0, 1, 1, "interruptor"), grupo: "viabilidade" },
  { ...f("viabilidade", "bloquearForaDoMapa", "Bloquear fora do grupo viável", "Desligado, quem está fora do grupo viável entra na lista como os outros.", 0, 1, 1, "interruptor"), grupo: "viabilidade" },
  // Avançado
  { ...f("confianca", "counter", "Confiança do counter (jogos)", "Jogos imaginários que puxam o confronto para o esperado: com N jogos vale N/(N+K). De fábrica 15.", 1, 100, 1, "inteiro"), grupo: "avancado" },
  { ...f("confianca", "dupla", "Confiança da dupla (jogos)", "O mesmo K para duplas. De fábrica 25.", 1, 100, 1, "inteiro"), grupo: "avancado" },
  { ...f("confianca", "trio", "Confiança do trio (jogos)", "O mesmo K para trios. De fábrica 40.", 1, 200, 1, "inteiro"), grupo: "avancado" },
  { ...f("tetoDosBonus", "ativo", "Teto dos bônus por pick", "A soma dos bônus não passa de um múltiplo da força do mapa, maior a cada pick.", 0, 1, 1, "interruptor"), grupo: "avancado" },
  { ...f("tetoDosBonus", "minimoNoFecho", "Teto mínimo nos picks 4–6", "Em log-odds, para quem tem força do mapa perto de zero. De fábrica 0,18.", 0, 1, 0.01, "numero"), grupo: "avancado" },
  { ...f("protecao", "teto", "Teto da proteção", "Máximo, em log-odds, do bônus de proteção. De fábrica 0,35.", 0, 1, 0.05, "numero"), grupo: "avancado" },
  { ...f("respostaTatica", "teto", "Teto da resposta à composição", "Máximo, em log-odds. De fábrica 0,25.", 0, 1, 0.05, "numero"), grupo: "avancado" },
];

/* ---- normalização ---- */

const limitar = (valor: unknown, min: number, max: number, padrao: number) =>
  typeof valor === "number" && Number.isFinite(valor) ? Math.min(max, Math.max(min, valor)) : padrao;

/** Põe uma distribuição a somar 100; sem valores válidos usa a de fábrica. */
export function normalizarPick(entrada: Partial<DistribuicaoDoPick> | undefined, padrao: DistribuicaoDoPick): DistribuicaoDoPick {
  const valores = CAMPOS_DO_PICK.map((c) => limitar(entrada?.[c], 0, 100, Number.NaN));
  if (valores.some((v) => !Number.isFinite(v))) return { ...padrao };
  const soma = valores.reduce((a, b) => a + b, 0);
  if (soma <= 0) return { ...padrao };
  const [vitoria, uso, counter, sinergia] = valores.map((v) => (v * 100) / soma);
  return { vitoria, uso, counter, sinergia };
}

/** Qualquer coisa vinda do navegador vira uma configuração válida. */
export function normalizarConfigDoMotorApi(entrada?: unknown): ConfigDoMotorApi {
  const bruto = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const config = configDeFabrica();
  const lerSecao = (nome: string) => (bruto[nome] && typeof bruto[nome] === "object" ? (bruto[nome] as Record<string, unknown>) : {});
  const listaDePicks = Array.isArray(bruto.picks) ? (bruto.picks as Array<Partial<DistribuicaoDoPick>>) : [];
  config.picks = config.picks.map((padrao, i) => normalizarPick(listaDePicks[i], padrao));
  for (const campo of CAMPOS_DA_CONFIG) {
    const secao = config[campo.secao] as unknown as Record<string, number>;
    secao[campo.campo] = limitar(lerSecao(campo.secao)[campo.campo], campo.min, campo.max, secao[campo.campo]);
    if (campo.formato === "inteiro") secao[campo.campo] = Math.round(secao[campo.campo]);
  }
  // Os campos que não têm descritor de painel mas fazem parte da configuração.
  const extras: Array<[SecaoEscalar, string, number, number]> = [
    ["protecao", "fator", 0, 2],
    ["respostaTatica", "abrirParedes", 0, 0.5], ["respostaTatica", "ultimoTank", 0, 0.5], ["respostaTatica", "ultimoLancador", 0, 0.5],
    ["bans", "tetoEscassezBase", 0, 0.5], ["risco", "ameacas", 1, 30],
  ];
  for (const [nome, campo, min, max] of extras) {
    const secao = config[nome] as unknown as Record<string, number>;
    secao[campo] = limitar(lerSecao(nome)[campo], min, max, secao[campo]);
  }
  const proporcoes = Array.isArray(lerSecao("tetoDosBonus").proporcao) ? (lerSecao("tetoDosBonus").proporcao as unknown[]) : [];
  config.tetoDosBonus.proporcao = config.tetoDosBonus.proporcao.map((padrao, i) => limitar(proporcoes[i], 0, 6, padrao));
  config.risco.ameacas = Math.round(config.risco.ameacas);
  return config;
}

/** A mesma normalização, guardada pela identidade do objeto (o motor chama-a por pedido). */
const guardadas = new WeakMap<object, Readonly<ConfigDoMotorApi>>();
export function configDoMotorApi(valor?: unknown): Readonly<ConfigDoMotorApi> {
  if (!valor || typeof valor !== "object") return CONFIG_PADRAO;
  const existente = guardadas.get(valor);
  if (existente) return existente;
  const nova = Object.freeze(normalizarConfigDoMotorApi(valor));
  guardadas.set(valor, nova);
  return nova;
}

/* ---- distribuição por pick ---- */

/** Os pesos que o motor usa num pick (1–6), no mesmo formato de `pesosDoPickApi`. */
export function pesosDaConfig(config: Pick<ConfigDoMotorApi, "picks">, turno = 1) {
  const n = Math.max(1, Math.min(6, Math.trunc(Number.isFinite(turno) ? turno : 1)));
  const { vitoria: v, uso: u, counter: c, sinergia: s } = config.picks[n - 1];
  const mapa = v + u;
  const vitoria = mapa > 0 ? v / mapa : 0.5;
  return { vitoria, uso: 1 - vitoria, mapa: mapa / 100, counter: c / 100, sinergia: s / 100 };
}

/**
 * Muda um campo de um pick e reparte a diferença pelos outros três, na
 * proporção que já tinham, para a linha continuar a somar 100.
 */
export function reequilibrarPick(pick: DistribuicaoDoPick, campo: keyof DistribuicaoDoPick, valor: number): DistribuicaoDoPick {
  const novo = Math.min(100, Math.max(0, Number.isFinite(valor) ? valor : 0));
  const outros = CAMPOS_DO_PICK.filter((c) => c !== campo);
  const somaDosOutros = outros.reduce((s, c) => s + pick[c], 0);
  const resto = 100 - novo;
  const resultado = { ...pick, [campo]: novo } as DistribuicaoDoPick;
  for (const c of outros) resultado[c] = somaDosOutros > 0 ? (pick[c] * resto) / somaDosOutros : resto / outros.length;
  return resultado;
}

/* ---- presets ---- */

export const PRESETS_DA_CONFIG = [
  { id: "padrao", nome: "Padrão (v181)", ajuda: "Os valores com que o motor sempre trabalhou." },
  { id: "counterForte", nome: "Counter forte", ajuda: "Counters pesam mais desde o pick 2 e o hard-counter é mais severo." },
  { id: "mapaPrimeiro", nome: "Mapa primeiro", ajuda: "A força do mapa manda; counters e sinergias só desempatam." },
] as const;
export type IdDoPreset = (typeof PRESETS_DA_CONFIG)[number]["id"];

function escalarParticipacao(picks: DistribuicaoDoPick[], fator: number) {
  return picks.map((p) => {
    const counter = p.counter * fator, sinergia = p.sinergia * fator;
    const mapa = p.vitoria + p.uso;
    const sobra = 100 - counter - sinergia;
    return mapa > 0 ? { vitoria: (p.vitoria * sobra) / mapa, uso: (p.uso * sobra) / mapa, counter, sinergia } : p;
  });
}

export function configDoPreset(id: IdDoPreset): ConfigDoMotorApi {
  const config = configDeFabrica();
  if (id === "counterForte") {
    config.picks = escalarParticipacao(config.picks, 1.6);
    config.counter.peso = 1.8;
    config.hardCounter.fator = 3.4;
  } else if (id === "mapaPrimeiro") {
    config.picks = escalarParticipacao(config.picks, 0.5);
    config.counter.peso = 1;
    config.hardCounter.fator = 1.8;
    config.forcas.risco = 0.5;
  }
  return config;
}

const IGUAL = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Que preset a configuração é, ou «personalizado» se já se afastou de todos. */
export function presetDaConfig(config: ConfigDoMotorApi): IdDoPreset | "personalizado" {
  const atual = normalizarConfigDoMotorApi(config);
  const arredondar = (c: ConfigDoMotorApi) => JSON.parse(JSON.stringify(c, (_k, v) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v)));
  const alvo = arredondar(atual);
  for (const { id } of PRESETS_DA_CONFIG) if (IGUAL(alvo, arredondar(configDoPreset(id)))) return id;
  return "personalizado";
}
