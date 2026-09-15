/**
 * Score Híbrido oficial: 70% taxa de vitória agregada normalizada por mapa
 * + 30% taxa de uso agregada normalizada por mapa. O Score 0–13 do TopBrawl
 * é mantido apenas como métrica de origem; nunca entra nesta fórmula.
 */
export const WIN_RATE_HYBRID_WEIGHT = 0.7;
export const USAGE_RATE_HYBRID_WEIGHT = 0.3;

export type HybridTier = "S" | "A" | "B";

export type UsageWinMetricRow = {
  map: string;
  score?: number | null;
  tier?: HybridTier | null;
  winRate?: number | null;
  usage?: number | null;
  brawlPlanetWinRate?: number | null;
  topBrawlWinRate?: number | null;
  brawlPlanetPickRate?: number | null;
  topBrawlUseRate?: number | null;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function average(values: readonly (number | null | undefined)[]) {
  const published = values.filter(finite);
  return published.length ? published.reduce((sum, value) => sum + value, 0) / published.length : null;
}

/**
 * Peso do TopBrawl no equilíbrio entre as duas fontes, de 0 a 1. Meio a meio é
 * o valor oficial: nenhuma das duas mostrou ser mais fiável que a outra, por
 * isso a média simples é o ponto de partida honesto.
 */
export const TOPBRAWL_SOURCE_WEIGHT = 0.5;

/**
 * Combina os valores das duas fontes segundo o peso escolhido.
 *
 * A regra que interessa é a do valor em falta: quando só uma fonte publica,
 * vale essa por inteiro, **independentemente do peso**. Aplicar 20% a um valor
 * único daria um número 80% mais baixo do que a realidade — e um brawler que só
 * uma fonte cobre passaria a parecer terrível por um acidente de configuração,
 * não por ser mau.
 */
function weighted(topBrawl: number | null | undefined, brawlPlanet: number | null | undefined, topBrawlWeight: number) {
  // Um peso inválido tem de cair no oficial. `clamp` sozinho deixa passar NaN,
  // e a partir daí todo o Score do mapa vinha NaN — sem erro e sem número.
  const peso = clamp(finite(topBrawlWeight) ? topBrawlWeight : TOPBRAWL_SOURCE_WEIGHT, 0, 1);
  if (finite(topBrawl) && finite(brawlPlanet)) return topBrawl * peso + brawlPlanet * (1 - peso);
  if (finite(topBrawl)) return topBrawl;
  if (finite(brawlPlanet)) return brawlPlanet;
  return null;
}

/** Agrega as taxas de vitória identificáveis nas duas fontes, sem inventar valores ausentes. */
export function aggregatePublishedWinRate(row: UsageWinMetricRow, topBrawlWeight = TOPBRAWL_SOURCE_WEIGHT) {
  const combinado = weighted(row.topBrawlWinRate, row.brawlPlanetWinRate, topBrawlWeight);
  return combinado ?? average([row.winRate]);
}

/** Agrega Pick Rate do Brawl Planet e Use Rate do TopBrawl na mesma escala percentual. */
export function aggregatePublishedUsageRate(row: UsageWinMetricRow, topBrawlWeight = TOPBRAWL_SOURCE_WEIGHT) {
  const combinado = weighted(row.topBrawlUseRate, row.brawlPlanetPickRate, topBrawlWeight);
  return combinado ?? average([row.usage]);
}

/**
 * Converte uma taxa publicada em pontos comparáveis dentro do mapa atual.
 * Empates recebem o mesmo valor. Se todas as taxas forem iguais, cada brawler
 * recebe 50 pontos: o sinal não cria um desempate artificial.
 */
export function normalizeRateForMap(rate: number | null | undefined, mapRates: readonly (number | null | undefined)[]) {
  if (!finite(rate)) return null;
  const values = mapRates.filter(finite);
  if (!values.length) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (maximum === minimum) return 50;
  return clamp(((rate - minimum) / (maximum - minimum)) * 100);
}

/** Mantém o nome anterior para consumidores externos que normalizem somente uso. */
export const normalizeUsageRateForMap = normalizeRateForMap;

export function calculateHybridScoreForWinRateWeight(
  normalizedWinRate: number | null | undefined,
  normalizedUsageRate: number | null | undefined,
  winRateWeight = WIN_RATE_HYBRID_WEIGHT,
): number | null {
  if (!finite(normalizedWinRate) || !finite(normalizedUsageRate)) return null;
  const safeWinWeight = clamp(winRateWeight, 0, 1);
  return (clamp(normalizedWinRate) * safeWinWeight) + (clamp(normalizedUsageRate) * (1 - safeWinWeight));
}

/** Aplica a fórmula a cada mapa, pois a normalização de vitória e uso é local. */
export function calculateHybridScoresByMap<T extends UsageWinMetricRow>(
  rows: readonly T[],
  winRateWeight = WIN_RATE_HYBRID_WEIGHT,
  topBrawlWeight = TOPBRAWL_SOURCE_WEIGHT,
): T[] {
  const metricsByMap = new Map<string, { winRate: number | null; usage: number | null }[]>();
  for (const row of rows) {
    const metrics = metricsByMap.get(row.map) ?? [];
    metrics.push({ winRate: aggregatePublishedWinRate(row, topBrawlWeight), usage: aggregatePublishedUsageRate(row, topBrawlWeight) });
    metricsByMap.set(row.map, metrics);
  }

  return rows.map((row) => {
    const winRate = aggregatePublishedWinRate(row, topBrawlWeight);
    const usage = aggregatePublishedUsageRate(row, topBrawlWeight);
    const mapMetrics = metricsByMap.get(row.map) ?? [];
    const winScore = normalizeRateForMap(winRate, mapMetrics.map((metric) => metric.winRate));
    const usageScore = normalizeRateForMap(usage, mapMetrics.map((metric) => metric.usage));
    const score = calculateHybridScoreForWinRateWeight(winScore, usageScore, winRateWeight);
    return score === null
      ? { ...row, winRate, usage }
      : { ...row, winRate, usage, score, tier: hybridTierForScore(score) };
  });
}

export function hybridTierForScore(score: number): HybridTier {
  if (score >= 75) return "S";
  if (score >= 65) return "A";
  return "B";
}
