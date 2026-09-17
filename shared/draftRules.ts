/**
 * Regras percentuais configuráveis do Draft. Os valores são fatores (0.05 = 5%)
 * para que o motor continue a calcular pontos diretamente sobre o Score Híbrido.
 */
export type DraftRuleSettings = {
  /**
   * Ajuste do Counter por Pick. O delta BrawlScope do confronto é multiplicado
   * por este fator antes de virar pontos: 1 mantém a percentagem publicada,
   * 2 duplica, 3 triplica e valores abaixo de 1 reduzem o peso do counter.
   *
   * Mantido como valor de referência e para compatibilidade com preferências
   * gravadas antes de o ajuste passar a ser por pick; o que o motor usa é o
   * multiplicador do pick em questão.
   */
  counterPickMultiplier: number;
  /**
   * Ajuste independente por pick.
   *
   * Existe porque um counter não vale o mesmo em todos os momentos do draft. No
   * primeiro pick escolhe-se às cegas e o adversário tem cinco escolhas para
   * responder; no último, o counter é definitivo porque já ninguém responde.
   * Quem quiser traduzir isso no Score baixa os primeiros e sobe os últimos —
   * e quem preferir tratar todos por igual deixa os seis a 1.
   */
  counterPickMultiplier1: number;
  counterPickMultiplier2: number;
  counterPickMultiplier3: number;
  counterPickMultiplier4: number;
  counterPickMultiplier5: number;
  counterPickMultiplier6: number;
  /**
   * Repartição entre taxa de vitória e taxa de uso, por pick.
   *
   * O Score Híbrido pesa 70% vitória e 30% uso. Esse par é único para o site
   * todo, e no Draft isso trata os seis picks como se fossem o mesmo momento —
   * e não são. No primeiro pick escolhe-se às cegas, e a taxa de uso diz algo
   * que a de vitória não diz: que o brawler é flexível e funciona em muitas
   * composições, que é precisamente o que protege quem ainda não sabe o que
   * vem a seguir. No último pick já não há nada a adivinhar, e o que interessa
   * é ganhar o confronto que está à frente.
   *
   * O valor é o peso da VITÓRIA, de 0 a 1. O uso fica com o resto: 0.7 é
   * 70/30, 0.8 é 80/20. Não há como os dois deixarem de somar 100.
   */
  winRatePick1: number;
  winRatePick2: number;
  winRatePick3: number;
  winRatePick4: number;
  winRatePick5: number;
  winRatePick6: number;
  counterPick1: number;
  counterPick2: number;
  counterPick3: number;
  counterPick4: number;
  counterPick5: number;
  counterPick6: number;
  /**
   * Quanto vale a sinergia da SEGUNDA fonte, em relação à primeira.
   *
   * O bónus de sinergia era uma fatia só, da fonte com prioridade: BrawlScope
   * à frente do Brawl Planet. Isso ignora um aliado que só a segunda fonte
   * publique — e as duas leem páginas diferentes, por isso cobrem pares
   * diferentes.
   *
   * Agora a segunda fonte acrescenta a sua fatia por todos os aliados que
   * publica, incluindo os que a primeira também publica: são duas medições
   * independentes da mesma dupla, feitas em populações diferentes, e uma não
   * anula a outra.
   *
   * Este peso é o que as distingue — 0,5 vale metade, 1 vale o mesmo, 0
   * desliga a segunda fonte e repõe o comportamento de fatia única.
   */
  synergySegundaFonte: number;
  synergyPick1: number;
  synergyPick2: number;
  synergyPick3: number;
  synergyPick4: number;
  synergyPick5: number;
  synergyPick6: number;
  banPick1: number;
  banPick2: number;
  banPick3: number;
  banPick4: number;
  banPick5Plus: number;
  missingMid: number;
  missingSide: number;
  openingLongRange: number;
  enemyCounterPenalty: number;
  repeatedEnemyCounterPressure: number;
  topCounterPenalty: number;
  sameClassPenalty: number;
  worstTeammatePenalty: number;
};

export const defaultDraftRuleSettings: DraftRuleSettings = {
  // 1 mantém exatamente a percentagem que o BrawlScope publica para o confronto.
  // O ajuste fica disponível nas regras do Draft para duplicar, triplicar ou reduzir.
  counterPickMultiplier: 1,
  // Por omissão, todos os picks valem a percentagem publicada tal como sai da
  // fonte. A escada por posição é uma opinião, não um dado — fica à escolha.
  counterPickMultiplier1: 1,
  counterPickMultiplier2: 1,
  counterPickMultiplier3: 1,
  counterPickMultiplier4: 1,
  counterPickMultiplier5: 1,
  counterPickMultiplier6: 1,
  /**
   * A escada que o Draft usa por omissão: 70/30 no primeiro pick, subindo cinco
   * pontos a cada pick até 95/5 no último.
   *
   * Ao contrário dos multiplicadores de Counter, que ficam neutros por omissão,
   * esta escada vem ligada: o 70/30 fixo também é uma opinião — a de que o
   * momento do draft não conta — e é a única das duas que não se podia
   * desligar. Quem preferir o valor único põe os seis iguais, e o botão ao lado
   * faz isso de uma vez.
   */
  winRatePick1: 0.7,
  winRatePick2: 0.75,
  winRatePick3: 0.8,
  winRatePick4: 0.85,
  winRatePick5: 0.9,
  winRatePick6: 0.95,
  // Matriz gradual: um sinal isolado informa, mas não ultrapassa o ranking do mapa.
  // Respostas aos picks 2/4/6 têm peso ligeiramente maior, por serem contrapartidas reais.
  counterPick1: 0.05,
  counterPick2: 0.06,
  counterPick3: 0.05,
  counterPick4: 0.06,
  counterPick5: 0.05,
  counterPick6: 0.06,
  // Metade: confirma sem mandar. A fonte principal é a que decide.
  synergySegundaFonte: 0.5,
  synergyPick1: 0.03,
  synergyPick2: 0.03,
  synergyPick3: 0.04,
  synergyPick4: 0.03,
  synergyPick5: 0.04,
  synergyPick6: 0.03,
  banPick1: 0.03,
  banPick2: 0.025,
  banPick3: 0.02,
  banPick4: 0.015,
  banPick5Plus: 0.01,
  missingMid: 0.04,
  missingSide: 0.04,
  openingLongRange: 0.03,
  enemyCounterPenalty: 0.035,
  repeatedEnemyCounterPressure: 0.03,
  topCounterPenalty: 0,
  sameClassPenalty: 0.03,
  worstTeammatePenalty: 0.03,
};

export const draftRuleSettingKeys = Object.keys(defaultDraftRuleSettings) as (keyof DraftRuleSettings)[];

/** Intervalo permitido para o ajuste do Counter por Pick. */
export const COUNTER_PICK_MULTIPLIER_MIN = 0.25;
export const COUNTER_PICK_MULTIPLIER_MAX = 3;
/** Opções oferecidas na interface, de reduzir a triplicar. */
export const counterPickMultiplierOptions = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3] as const;

function normalizeRate(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/**
 * Protege o motor de valores inválidos e permite passar apenas as regras que
 * precisam de substituir os valores oficiais. O intervalo é sempre 0%–100%.
 */
/** As chaves que são multiplicadores, e não percentagens. */
export const counterMultiplierKeys = [
  "counterPickMultiplier",
  "counterPickMultiplier1",
  "counterPickMultiplier2",
  "counterPickMultiplier3",
  "counterPickMultiplier4",
  "counterPickMultiplier5",
  "counterPickMultiplier6",
] as const satisfies readonly (keyof DraftRuleSettings)[];

export function isCounterMultiplierKey(key: keyof DraftRuleSettings) {
  return (counterMultiplierKeys as readonly string[]).includes(key);
}

function normalizeMultiplier(value: unknown, fallback: number) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(COUNTER_PICK_MULTIPLIER_MAX, Math.max(COUNTER_PICK_MULTIPLIER_MIN, numeric));
}

export function normalizeDraftRuleSettings(value?: Partial<DraftRuleSettings> | null): DraftRuleSettings {
  const candidate = value ?? {};
  /**
   * Migração das preferências gravadas antes do ajuste por pick: quem tinha o
   * Counter em 2×, por exemplo, continua com 2× nos seis picks em vez de voltar
   * silenciosamente a 1×. Só vale quando o pick não traz valor próprio.
   */
  const herdado = typeof candidate.counterPickMultiplier === "number" && Number.isFinite(candidate.counterPickMultiplier)
    ? candidate.counterPickMultiplier
    : undefined;

  return draftRuleSettingKeys.reduce((settings, key) => {
    if (!isCounterMultiplierKey(key)) {
      settings[key] = normalizeRate(candidate[key], defaultDraftRuleSettings[key]);
      return settings;
    }
    const proprio = candidate[key];
    const base = typeof proprio === "number" && Number.isFinite(proprio)
      ? proprio
      : key === "counterPickMultiplier" ? defaultDraftRuleSettings[key] : herdado ?? defaultDraftRuleSettings[key];
    settings[key] = normalizeMultiplier(base, defaultDraftRuleSettings[key]);
    return settings;
  }, {} as DraftRuleSettings);
}

/**
 * Multiplicador em vigor para um pick. Fora do intervalo 1–6 vale o do primeiro
 * pick, que é o mesmo critério usado no resto do motor.
 */
/**
 * Peso da taxa de vitória em vigor para um pick, de 0 a 1.
 *
 * Fora do intervalo 1–6 vale o do primeiro pick, pelo mesmo critério que o
 * resto do motor já usa: antes de o draft começar, o que está à frente é a
 * situação do primeiro pick.
 */
export function getWinRatePickWeight(pickNumber: number | undefined, settings: DraftRuleSettings) {
  const byPick: Record<number, number> = {
    1: settings.winRatePick1,
    2: settings.winRatePick2,
    3: settings.winRatePick3,
    4: settings.winRatePick4,
    5: settings.winRatePick5,
    6: settings.winRatePick6,
  };
  const pick = typeof pickNumber === "number" && Number.isFinite(pickNumber) ? Math.trunc(pickNumber) : 1;
  return byPick[pick] ?? settings.winRatePick1;
}

/** As chaves da escada, na ordem dos picks, para a interface não as repetir à mão. */
export const winRatePickKeys = [
  "winRatePick1",
  "winRatePick2",
  "winRatePick3",
  "winRatePick4",
  "winRatePick5",
  "winRatePick6",
] as const satisfies readonly (keyof DraftRuleSettings)[];

export function getCounterPickMultiplier(pickNumber: number | undefined, settings: DraftRuleSettings) {
  const byPick: Record<number, number> = {
    1: settings.counterPickMultiplier1,
    2: settings.counterPickMultiplier2,
    3: settings.counterPickMultiplier3,
    4: settings.counterPickMultiplier4,
    5: settings.counterPickMultiplier5,
    6: settings.counterPickMultiplier6,
  };
  return byPick[Number(pickNumber)] ?? settings.counterPickMultiplier1;
}
