/*
 * Brawl Híbrido — generated data layer.
 * Visual language: Brawl Stars Championship Arena. Keep data presentation dense,
 * high-contrast, and transparent about what the hybrid score represents.
 */

import { additionalMapSummaries, additionalRankedMaps, additionalRankedRows } from './additionalRankedData';
import { beachBallRankedRows } from './beachBallRankedData';
import { spiralingOutMapSummary, spiralingOutRankedRows } from './spiralingOutRankedData';
import {
  TOPBRAWL_SOURCE_WEIGHT,
  WIN_RATE_HYBRID_WEIGHT,
  calculateHybridScoresByMap,
  hybridTierForScore,
} from '@shared/hybridScore';

export type Tier = 'S' | 'A' | 'B';

export type RankedRow = {
  map: string;
  mode: string;
  modeId: string;
  brawler: string;
  score: number | null;
  tier: Tier | null;
  brawlerId?: number | null;
  /** Média híbrida entre Use Rate do TopBrawl e Pick Rate do Brawl Planet. */
  usage?: number | null;
  /** Compatibilidade: Win Rate da Brawl Planet na camada anterior. */
  winRate?: number | null;
  topBrawlWinRate?: number | null;
  topBrawlUseRate?: number | null;
  topBrawlScore?: number | null;
  brawlPlanetWinRate?: number | null;
  brawlPlanetPickRate?: number | null;
  /** Mantém null até a fonte publicar um valor identificável de Star Player. */
  brawlPlanetStarPlayer?: number | null;
  /** Ban Rate é opcional: só é usado quando a fonte o publicar. */
  banRate?: number | null;
  /** Counter Rate pode ser fornecido por uma fonte futura; não é inventado no fallback. */
  counterRate?: number | null;
  dataStatus?: 'complete' | 'partial';
  /** Distingue uma entrada de catálogo da pool efetivamente elegível no Ranked. */
  rankedStatus?: 'active' | 'unavailable';
};

export type MapSummary = {
  name: string;
  mode: string;
  modeId: string;
  brawlerCount: number;
  topScore: number;
  tiers: Record<Tier, number>;
};

export const mapModeOverrides: Record<string, Pick<MapSummary, 'mode' | 'modeId'>> = {
  "Beach Ball": { mode: "Fute-Brawl", modeId: "brawl-ball" },
  "Belle's Rock": { mode: "Nocaute", modeId: "knockout" },
  "Bridge Too Far": { mode: "Roubo", modeId: "heist" },
  "Center Stage": { mode: "Fute-Brawl", modeId: "brawl-ball" },
  "Double Swoosh": { mode: "Pique-Gema", modeId: "gem-grab" },
  "Dry Season": { mode: "Caça-Estrelas", modeId: "bounty" },
  "Dueling Beetles": { mode: "Zona Estratégica", modeId: "hot-zone" },
  "Flaring Phoenix": { mode: "Nocaute", modeId: "knockout" },
  "Gem Fort": { mode: "Pique-Gema", modeId: "gem-grab" },
  "Hard Rock Mine": { mode: "Pique-Gema", modeId: "gem-grab" },
  "Hideout": { mode: "Caça-Estrelas", modeId: "bounty" },
  "Hot Potato": { mode: "Roubo", modeId: "heist" },
  "Kaboom Canyon": { mode: "Roubo", modeId: "heist" },
  "Layer Cake": { mode: "Caça-Estrelas", modeId: "bounty" },
  "New Horizons": { mode: "Nocaute", modeId: "knockout" },
  "Open Business": { mode: "Zona Estratégica", modeId: "hot-zone" },
  "Out in the Open": { mode: "Nocaute", modeId: "knockout" },
  "Parallel Plays": { mode: "Zona Estratégica", modeId: "hot-zone" },
  "Pinball Dreams": { mode: "Fute-Brawl", modeId: "brawl-ball" },
  "Ring of Fire": { mode: "Zona Estratégica", modeId: "hot-zone" },
  "Safe Zone": { mode: "Roubo", modeId: "heist" },
  "Shooting Star": { mode: "Caça-Estrelas", modeId: "bounty" },
  "Sneaky Fields": { mode: "Fute-Brawl", modeId: "brawl-ball" },
  "Spiraling Out": { mode: "Fute-Brawl", modeId: "brawl-ball" },
  "Triple Dribble": { mode: "Fute-Brawl", modeId: "brawl-ball" },
  "Undermine": { mode: "Pique-Gema", modeId: "gem-grab" },
};

export function normalizeRankedMap<T extends { name: string; mode: string; modeId: string }>(map: T): T {
  const override = mapModeOverrides[map.name];
  return override ? { ...map, ...override } : map;
}

export function normalizeRankedRow<T extends RankedRow>(row: T): T {
  const override = mapModeOverrides[row.map];
  return (override ? { ...row, ...override } : row) as T;
}

/** Recalcula uma coleção completa com uso normalizado no mapa e pesos vitória/uso. */
export function normalizeRankedRows<T extends RankedRow>(
  rows: readonly T[],
  winRateWeight = WIN_RATE_HYBRID_WEIGHT,
  topBrawlWeight = TOPBRAWL_SOURCE_WEIGHT,
): T[] {
  const normalized = rows.map((row) => normalizeRankedRow(row));
  return calculateHybridScoresByMap(normalized, winRateWeight, topBrawlWeight).map((row) => {
    const hasPublishedMetrics = typeof row.winRate === 'number' && typeof row.usage === 'number';
    return hasPublishedMetrics ? { ...row, dataStatus: 'complete' } : row;
  }) as T[];
}

/**
 * Produz o catálogo efetivamente jogável a partir da mesma snapshot de linhas
 * que alimenta o ranking. Mapas sem linhas atuais não chegam ao Draft, evitando
 * que a rotação e os dados de pick fiquem fora de sincronia.
 */
export function buildActiveRankedMapCatalog(
  snapshotMaps: readonly MapSummary[] | null | undefined,
  rows: readonly RankedRow[],
  fallbackMaps: readonly MapSummary[],
  winRateWeight = WIN_RATE_HYBRID_WEIGHT,
  topBrawlWeight = TOPBRAWL_SOURCE_WEIGHT,
): MapSummary[] {
  const sourceMaps = snapshotMaps?.length ? snapshotMaps : fallbackMaps;
  const mapsByName = new Map<string, MapSummary>();
  for (const sourceMap of sourceMaps) {
    const map = normalizeRankedMap(sourceMap);
    if (!mapsByName.has(map.name)) mapsByName.set(map.name, map);
  }

  const rowsByMap = new Map<string, RankedRow[]>();
  for (const row of normalizeRankedRows(rows, winRateWeight, topBrawlWeight)) {
    if (snapshotMaps ? !mapsByName.has(row.map) : !currentRankedMapNameSet.has(row.map)) continue;
    const mapRows = rowsByMap.get(row.map) ?? [];
    mapRows.push(row);
    rowsByMap.set(row.map, mapRows);
  }

  const activeNames = rowsByMap.size
    ? [
        ...sourceMaps.map(normalizeRankedMap).map((map) => map.name).filter((name, index, names) => rowsByMap.has(name) && names.indexOf(name) === index),
        ...Array.from(rowsByMap.keys()).filter((name) => !mapsByName.has(name)),
      ]
    : Array.from(mapsByName.keys());

  return activeNames.map((name) => {
    const mapRows = rowsByMap.get(name) ?? [];
    const template = mapsByName.get(name);
    const firstRow = mapRows[0];
    const base = normalizeRankedMap(template ?? {
      name,
      mode: firstRow?.mode ?? "Ranked",
      modeId: firstRow?.modeId ?? "ranked",
      brawlerCount: 0,
      topScore: 0,
      tiers: { S: 0, A: 0, B: 0 },
    });

    if (!mapRows.length) return base;

    const tiers: MapSummary["tiers"] = { S: 0, A: 0, B: 0 };
    const scores: number[] = [];
    for (const row of mapRows) {
      if (row.tier) tiers[row.tier] += 1;
      if (typeof row.score === "number") scores.push(row.score);
    }

    return {
      ...base,
      brawlerCount: mapRows.length,
      topScore: scores.length ? Math.max(...scores) : base.topScore,
      tiers,
    };
  });
}

/** Resolve uma seleção de mapa para uma entrada válida do catálogo ativo. */
export function resolveRankedMapSelection(maps: readonly MapSummary[], requestedName?: string) {
  return maps.find((map) => map.name === requestedName) ?? maps[0];
}

export type RankedRotationAverage = {
  brawler: string;
  brawlerId: number | null;
  averageScore: number;
  mapCount: number;
  tier: Tier;
};

export type RankedRotationComparison = RankedRotationAverage & {
  officialRank: number;
  legacyRank: number;
  legacyAverageScore: number;
  rankChange: number;
  experimentalRank: number;
  experimentalAverageScore: number;
  experimentalScoreChange: number;
  averageBrawlPlanetWinRate: number | null;
  averageHybridUsage: number | null;
};

function tierForHybridScore(score: number): Tier {
  if (score >= 75) return "S";
  if (score >= 65) return "A";
  return "B";
}

/**
 * Condensa a rotação ativa numa leitura de consistência por brawler. Cada
 * mapa contribui uma única vez e somente scores numéricos entram na média.
 */
export function buildRankedRotationAverages(
  rows: readonly RankedRow[],
  activeMaps: readonly MapSummary[],
  winRateWeight = WIN_RATE_HYBRID_WEIGHT,
  topBrawlWeight = TOPBRAWL_SOURCE_WEIGHT,
): RankedRotationAverage[] {
  const activeMapNames = new Set(activeMaps.map((map) => normalizeRankedMap(map).name));
  const scoresByBrawler = new Map<string, { brawlerId: number | null; scoresByMap: Map<string, number> }>();

  // O equilíbrio entre fontes tem de chegar aqui: esta função RECALCULA o Score
  // a partir das linhas de origem, por isso ignorá-lo desfazia silenciosamente a
  // escolha feita a montante — a tabela voltava sempre ao 50/50.
  for (const row of normalizeRankedRows(rows, winRateWeight, topBrawlWeight)) {
    if (!activeMapNames.has(row.map) || typeof row.score !== "number") continue;

    const current = scoresByBrawler.get(row.brawler) ?? {
      brawlerId: row.brawlerId ?? null,
      scoresByMap: new Map<string, number>(),
    };
    if (current.brawlerId === null && row.brawlerId !== null && row.brawlerId !== undefined) current.brawlerId = row.brawlerId;
    if (!current.scoresByMap.has(row.map)) current.scoresByMap.set(row.map, row.score);
    scoresByBrawler.set(row.brawler, current);
  }

  return Array.from(scoresByBrawler.entries())
    .map(([brawler, entry]) => {
      const values = Array.from(entry.scoresByMap.values());
      const averageScore = values.reduce((total, score) => total + score, 0) / values.length;
      return {
        brawler,
        brawlerId: entry.brawlerId,
        averageScore,
        mapCount: values.length,
        tier: tierForHybridScore(averageScore),
      };
    })
    .sort((left, right) => right.averageScore - left.averageScore || left.brawler.localeCompare(right.brawler));
}

/** Recalcula uma leitura de rotação em memória para uma divisão Vitória/Uso. */
export function buildRankedRotationAveragesForWinRateWeight(
  rows: readonly RankedRow[],
  activeMaps: readonly MapSummary[],
  winRateWeight: number,
  topBrawlWeight = TOPBRAWL_SOURCE_WEIGHT,
): RankedRotationAverage[] {
  const activeMapNames = new Set(activeMaps.map((map) => normalizeRankedMap(map).name));
  const scoresByBrawler = new Map<string, { brawlerId: number | null; scoresByMap: Map<string, number> }>();

  for (const row of normalizeRankedRows(rows, winRateWeight, topBrawlWeight)) {
    if (!activeMapNames.has(row.map) || typeof row.score !== "number") continue;

    const current = scoresByBrawler.get(row.brawler) ?? {
      brawlerId: row.brawlerId ?? null,
      scoresByMap: new Map<string, number>(),
    };
    if (current.brawlerId === null && row.brawlerId !== null && row.brawlerId !== undefined) current.brawlerId = row.brawlerId;
    if (!current.scoresByMap.has(row.map)) current.scoresByMap.set(row.map, row.score);
    scoresByBrawler.set(row.brawler, current);
  }

  return Array.from(scoresByBrawler.entries())
    .map(([brawler, entry]) => {
      const values = Array.from(entry.scoresByMap.values());
      const averageScore = values.reduce((total, score) => total + score, 0) / values.length;
      return {
        brawler,
        brawlerId: entry.brawlerId,
        averageScore,
        mapCount: values.length,
        tier: tierForHybridScore(averageScore),
      };
    })
    .sort((left, right) => right.averageScore - left.averageScore || left.brawler.localeCompare(right.brawler));
}

export function buildRankedRotationComparison(
  rows: readonly RankedRow[],
  activeMaps: readonly MapSummary[],
  experimentalWinRateWeight = WIN_RATE_HYBRID_WEIGHT,
  topBrawlWeight = TOPBRAWL_SOURCE_WEIGHT,
): RankedRotationComparison[] {
  const activeMapNames = new Set(activeMaps.map((map) => normalizeRankedMap(map).name));
  // A coluna oficial é a referência fixa e mantém o equilíbrio padrão; as outras
  // acompanham o que o utilizador escolheu, senão a comparação não compara nada.
  const official = buildRankedRotationAveragesForWinRateWeight(rows, activeMaps, WIN_RATE_HYBRID_WEIGHT);
  const legacy = buildRankedRotationAveragesForWinRateWeight(rows, activeMaps, 0.5, topBrawlWeight);
  const experimental = buildRankedRotationAveragesForWinRateWeight(rows, activeMaps, experimentalWinRateWeight, topBrawlWeight);
  const legacyByBrawler = new Map(legacy.map((entry, index) => [entry.brawler, { ...entry, rank: index + 1 }]));
  const experimentalByBrawler = new Map(experimental.map((entry, index) => [entry.brawler, { ...entry, rank: index + 1 }]));
  const sourceMetricsByBrawler = new Map<string, { winRatesByMap: Map<string, number>; usageByMap: Map<string, number> }>();

  for (const sourceRow of rows) {
    const override = mapModeOverrides[sourceRow.map];
    const row = override ? { ...sourceRow, ...override } : sourceRow;
    if (!activeMapNames.has(row.map)) continue;

    const current = sourceMetricsByBrawler.get(row.brawler) ?? {
      winRatesByMap: new Map<string, number>(),
      usageByMap: new Map<string, number>(),
    };
    const winRate = row.brawlPlanetWinRate ?? row.topBrawlWinRate ?? row.winRate;
    if (typeof winRate === "number" && !current.winRatesByMap.has(row.map)) current.winRatesByMap.set(row.map, winRate);
    if (typeof row.usage === "number" && !current.usageByMap.has(row.map)) current.usageByMap.set(row.map, row.usage);
    sourceMetricsByBrawler.set(row.brawler, current);
  }

  return official.flatMap((entry, index) => {
    const legacyEntry = legacyByBrawler.get(entry.brawler);
    const experimentalEntry = experimentalByBrawler.get(entry.brawler);
    if (!legacyEntry || !experimentalEntry) return [];
    const officialRank = index + 1;
    const sourceMetrics = sourceMetricsByBrawler.get(entry.brawler);
    const averageOf = (values: Iterable<number>) => {
      const list = Array.from(values);
      return list.length ? list.reduce((total, value) => total + value, 0) / list.length : null;
    };
    return [{
      ...entry,
      officialRank,
      legacyRank: legacyEntry.rank,
      legacyAverageScore: legacyEntry.averageScore,
      rankChange: legacyEntry.rank - officialRank,
      experimentalRank: experimentalEntry.rank,
      experimentalAverageScore: experimentalEntry.averageScore,
      experimentalScoreChange: experimentalEntry.averageScore - entry.averageScore,
      averageBrawlPlanetWinRate: averageOf(sourceMetrics?.winRatesByMap.values() ?? []),
      averageHybridUsage: averageOf(sourceMetrics?.usageByMap.values() ?? []),
    }];
  });
}

export const rankedRows: RankedRow[] = [
  {
    "map": "Beach Ball",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Amber",
    "score": 75.17,
    "tier": "S",
    "topBrawlWinRate": 59.83,
    "topBrawlUseRate": 7.70,
    "dataStatus": "partial"
  },
  {
    "map": "Beach Ball",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Shade",
    "score": 70.06,
    "tier": "A",
    "topBrawlWinRate": 59.09,
    "topBrawlUseRate": 12.97,
    "dataStatus": "partial"
  },
  {
    "map": "Beach Ball",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "El Primo",
    "score": 48.74,
    "tier": "B",
    "topBrawlWinRate": 57.18,
    "topBrawlUseRate": 16.13,
    "dataStatus": "partial"
  },
  {
    "map": "Beach Ball",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gus",
    "score": 42.14,
    "tier": "B",
    "topBrawlWinRate": 57.04,
    "topBrawlUseRate": 9.91,
    "dataStatus": "partial"
  },
  {
    "map": "Beach Ball",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bibi",
    "score": 46.61,
    "tier": "B",
    "topBrawlWinRate": 56.59,
    "topBrawlUseRate": 22.83,
    "dataStatus": "partial"
  },
  {
    "map": "Beach Ball",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Wendy",
    "score": 18.34,
    "tier": "B",
    "topBrawlWinRate": 55.25,
    "topBrawlUseRate": 7.98,
    "dataStatus": "partial"
  },
  {
    "map": "Beach Ball",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Damian",
    "score": 20.30,
    "tier": "B",
    "topBrawlWinRate": 55.63,
    "topBrawlUseRate": 4.43,
    "dataStatus": "partial"
  },
  {
    "map": "Beach Ball",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Clancy",
    "score": 18.46,
    "tier": "B",
    "topBrawlWinRate": 55.48,
    "topBrawlUseRate": 4.46,
    "dataStatus": "partial"
  },
  {
    "map": "Beach Ball",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Griff",
    "score": 30.00,
    "tier": "B",
    "topBrawlWinRate": 54.21,
    "topBrawlUseRate": 39.53,
    "dataStatus": "partial"
  },
  {
    "map": "Beach Ball",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Hank",
    "score": 44.96,
    "tier": "B",
    "topBrawlWinRate": 57.82,
    "topBrawlUseRate": 1.08,
    "dataStatus": "partial"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nori",
    "score": 74.94,
    "tier": "A"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bolt",
    "score": 74.56,
    "tier": "A"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Starr Nova",
    "score": 68.59,
    "tier": "A"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sprout",
    "score": 65.12,
    "tier": "A"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gray",
    "score": 65.05,
    "tier": "A"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Damian",
    "score": 63.23,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Tick",
    "score": 58.31,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bonnie",
    "score": 50.36,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Hank",
    "score": 49.22,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gigi",
    "score": 43.54,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mr. P",
    "score": 43.39,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ziggy",
    "score": 38.42,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sirius",
    "score": 34.31,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Nori",
    "score": 72.12,
    "tier": "A"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bolt",
    "score": 67.54,
    "tier": "A"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Starr Nova",
    "score": 65.65,
    "tier": "A"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Damian",
    "score": 65.21,
    "tier": "A"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mico",
    "score": 64.44,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Jessie",
    "score": 59.96,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Chuck",
    "score": 59.72,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Tick",
    "score": 58.31,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Piper",
    "score": 58.05,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Kaze",
    "score": 55.26,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mandy",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gigi",
    "score": 44.86,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Melodie",
    "score": 44.26,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Nani",
    "score": 43.98,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Hank",
    "score": 42.62,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Najia",
    "score": 39.0,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Sirius",
    "score": 37.73,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Damian",
    "score": 69.89,
    "tier": "A"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Nori",
    "score": 68.46,
    "tier": "A"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Jacky",
    "score": 65.59,
    "tier": "A"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bolt",
    "score": 65.38,
    "tier": "A"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Starr Nova",
    "score": 63.85,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bibi",
    "score": 63.78,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Tick",
    "score": 63.71,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Emz",
    "score": 57.99,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Tara",
    "score": 53.92,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Griff",
    "score": 50.06,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Frank",
    "score": 46.73,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gigi",
    "score": 43.54,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Hank",
    "score": 42.62,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Sirius",
    "score": 37.85,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bolt",
    "score": 73.6,
    "tier": "A"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Nori",
    "score": 68.46,
    "tier": "A"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ash",
    "score": 67.05,
    "tier": "A"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Starr Nova",
    "score": 65.83,
    "tier": "A"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Damian",
    "score": 65.39,
    "tier": "A"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mico",
    "score": 61.14,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Tick",
    "score": 58.31,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ollie",
    "score": 56.1,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Kaze",
    "score": 55.44,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Tara",
    "score": 55.42,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Charlie",
    "score": 50.46,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Draco",
    "score": 48.74,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Janet",
    "score": 45.67,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gigi",
    "score": 45.04,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Hank",
    "score": 42.62,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mina",
    "score": 42.58,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mr. P",
    "score": 41.59,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Melodie",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Najia",
    "score": 39.18,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ruffs",
    "score": 39.02,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sirius",
    "score": 36.59,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bolt",
    "score": 75.04,
    "tier": "S"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Damian",
    "score": 68.69,
    "tier": "A"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Starr Nova",
    "score": 68.65,
    "tier": "A"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Nori",
    "score": 68.46,
    "tier": "A"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bo",
    "score": 61.11,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Tick",
    "score": 60.47,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mico",
    "score": 60.3,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Kaze",
    "score": 54.9,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Griff",
    "score": 47.3,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Janet",
    "score": 46.09,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gigi",
    "score": 44.5,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Hank",
    "score": 42.62,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mina",
    "score": 40.54,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Melodie",
    "score": 40.42,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Najia",
    "score": 38.64,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Sirius",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Nori",
    "score": 68.46,
    "tier": "A"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bolt",
    "score": 65.38,
    "tier": "A"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Starr Nova",
    "score": 63.85,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Damian",
    "score": 63.23,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Tick",
    "score": 58.31,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gigi",
    "score": 43.54,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Hank",
    "score": 42.62,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sirius",
    "score": 34.31,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bolt",
    "score": 76.12,
    "tier": "S"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Starr Nova",
    "score": 70.39,
    "tier": "A"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Damian",
    "score": 69.35,
    "tier": "A"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nori",
    "score": 68.46,
    "tier": "A"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sprout",
    "score": 62.48,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Tick",
    "score": 61.73,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Hank",
    "score": 46.88,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Janet",
    "score": 46.09,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kit",
    "score": 44.26,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gigi",
    "score": 43.54,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Najia",
    "score": 40.38,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sirius",
    "score": 38.45,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Nori",
    "score": 73.44,
    "tier": "A"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Bolt",
    "score": 73.42,
    "tier": "A"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Starr Nova",
    "score": 71.35,
    "tier": "A"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Damian",
    "score": 70.85,
    "tier": "A"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Tick",
    "score": 62.93,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Bo",
    "score": 62.85,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Hank",
    "score": 48.32,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Kenji",
    "score": 45.41,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Gigi",
    "score": 43.54,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Sirius",
    "score": 37.67,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Ziggy",
    "score": 36.8,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Nori",
    "score": 68.46,
    "tier": "A"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Bolt",
    "score": 65.38,
    "tier": "A"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Starr Nova",
    "score": 63.85,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Pearl",
    "score": 63.46,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Grom",
    "score": 63.45,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Damian",
    "score": 63.23,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Buster",
    "score": 61.62,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Tick",
    "score": 61.43,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Ollie",
    "score": 55.32,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Frank",
    "score": 48.29,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Kit",
    "score": 44.38,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Gigi",
    "score": 43.54,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Hank",
    "score": 42.62,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Mr. P",
    "score": 40.63,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Rosa",
    "score": 38.79,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Sirius",
    "score": 37.79,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Nori",
    "score": 68.46,
    "tier": "A"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bolt",
    "score": 65.38,
    "tier": "A"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Starr Nova",
    "score": 63.85,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Damian",
    "score": 63.23,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Tick",
    "score": 58.31,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gigi",
    "score": 43.54,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Hank",
    "score": 42.62,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sirius",
    "score": 34.31,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bolt",
    "score": 73.18,
    "tier": "A"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Nori",
    "score": 71.58,
    "tier": "A"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Damian",
    "score": 70.01,
    "tier": "A"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Starr Nova",
    "score": 68.77,
    "tier": "A"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bibi",
    "score": 63.6,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bo",
    "score": 62.19,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mico",
    "score": 60.84,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Rico",
    "score": 58.37,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Tick",
    "score": 58.31,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Kaze",
    "score": 55.44,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Surge",
    "score": 54.17,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Griff",
    "score": 47.84,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gigi",
    "score": 45.04,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Hank",
    "score": 42.62,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Melodie",
    "score": 40.96,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Najia",
    "score": 39.18,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sirius",
    "score": 37.85,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bolt",
    "score": 77.14,
    "tier": "S"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nori",
    "score": 73.98,
    "tier": "A"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Damian",
    "score": 72.11,
    "tier": "A"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Starr Nova",
    "score": 69.43,
    "tier": "A"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Tick",
    "score": 58.31,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Glowy",
    "score": 49.05,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gigi",
    "score": 47.86,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mina",
    "score": 42.76,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Hank",
    "score": 42.62,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nani",
    "score": 41.46,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sirius",
    "score": 34.31,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Nori",
    "score": 78.54,
    "tier": "S"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bolt",
    "score": 70.36,
    "tier": "A"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Starr Nova",
    "score": 68.95,
    "tier": "A"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mico",
    "score": 65.16,
    "tier": "A"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Damian",
    "score": 63.23,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Emz",
    "score": 61.17,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Kaze",
    "score": 58.5,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Tick",
    "score": 58.31,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gigi",
    "score": 48.16,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Hank",
    "score": 46.7,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Melodie",
    "score": 43.6,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Sirius",
    "score": 39.65,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bolt",
    "score": 72.46,
    "tier": "A"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nori",
    "score": 68.46,
    "tier": "A"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Damian",
    "score": 67.97,
    "tier": "A"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Starr Nova",
    "score": 67.45,
    "tier": "A"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Brock",
    "score": 62.49,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Tick",
    "score": 61.55,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Carl",
    "score": 60.94,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Surge",
    "score": 55.97,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Penny",
    "score": 54.1,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Meeple",
    "score": 44.28,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gigi",
    "score": 43.54,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Hank",
    "score": 42.62,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mr. P",
    "score": 41.35,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sirius",
    "score": 34.31,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bolt",
    "score": 71.26,
    "tier": "A"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Nori",
    "score": 68.46,
    "tier": "A"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Doug",
    "score": 67.82,
    "tier": "A"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Sandy",
    "score": 66.3,
    "tier": "A"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gray",
    "score": 65.23,
    "tier": "A"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Starr Nova",
    "score": 63.85,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Damian",
    "score": 63.23,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Tick",
    "score": 58.31,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Draco",
    "score": 53.84,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Hank",
    "score": 51.14,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Finx",
    "score": 49.32,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Glowy",
    "score": 49.11,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mina",
    "score": 45.58,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gigi",
    "score": 43.54,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Trunk",
    "score": 41.01,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Sirius",
    "score": 34.31,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bolt",
    "score": 75.94,
    "tier": "S"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nori",
    "score": 74.88,
    "tier": "A"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Damian",
    "score": 69.59,
    "tier": "A"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Starr Nova",
    "score": 69.55,
    "tier": "A"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pearl",
    "score": 68.38,
    "tier": "A"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Buster",
    "score": 63.9,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Eve",
    "score": 61.93,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Angelo",
    "score": 59.15,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Tick",
    "score": 58.31,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gigi",
    "score": 43.54,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mr. P",
    "score": 43.15,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Hank",
    "score": 42.62,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Shade",
    "score": 34.92,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Sirius",
    "score": 34.31,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Nori",
    "score": 78.06,
    "tier": "S"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Bolt",
    "score": 74.5,
    "tier": "A"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Starr Nova",
    "score": 71.05,
    "tier": "A"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Damian",
    "score": 70.97,
    "tier": "A"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Doug",
    "score": 69.5,
    "tier": "A"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Ash",
    "score": 62.31,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Sandy",
    "score": 61.38,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Juju",
    "score": 61.36,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Tick",
    "score": 58.31,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Hank",
    "score": 49.4,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Charlie",
    "score": 46.62,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Gigi",
    "score": 43.54,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Trunk",
    "score": 43.05,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Shade",
    "score": 41.1,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Larry & Lawrie",
    "score": 41.08,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Lou",
    "score": 39.85,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Sirius",
    "score": 34.31,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Nori",
    "score": 75.48,
    "tier": "S"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Damian",
    "score": 71.69,
    "tier": "A"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Starr Nova",
    "score": 71.65,
    "tier": "A"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Ash",
    "score": 70.29,
    "tier": "A"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Sandy",
    "score": 66.36,
    "tier": "A"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bolt",
    "score": 65.38,
    "tier": "A"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Doug",
    "score": 62.0,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Jacky",
    "score": 61.69,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bibi",
    "score": 61.08,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Nita",
    "score": 60.77,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Pearl",
    "score": 60.46,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Brock",
    "score": 60.15,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Grom",
    "score": 59.85,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Sprout",
    "score": 59.54,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gray",
    "score": 59.23,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Edgar",
    "score": 58.92,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mico",
    "score": 58.62,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Tick",
    "score": 58.31,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Carl",
    "score": 58.0,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bo",
    "score": 57.69,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Chuck",
    "score": 57.38,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Jessie",
    "score": 57.08,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "8-bit",
    "score": 56.77,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Buster",
    "score": 56.46,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bull",
    "score": 56.15,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Rico",
    "score": 55.85,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Clancy",
    "score": 55.54,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Emz",
    "score": 55.23,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Stu",
    "score": 54.92,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Willow",
    "score": 54.62,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Eve",
    "score": 54.31,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Kaze",
    "score": 54.0,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Angelo",
    "score": 53.69,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Juju",
    "score": 53.38,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Poco",
    "score": 53.08,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Piper",
    "score": 52.77,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Leon",
    "score": 52.46,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Max",
    "score": 52.15,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mandy",
    "score": 51.85,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Charlie",
    "score": 51.72,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Ollie",
    "score": 51.54,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Surge",
    "score": 51.23,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Tara",
    "score": 50.92,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Penny",
    "score": 50.62,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Spike",
    "score": 50.31,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gale",
    "score": 50.0,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Colette",
    "score": 49.69,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Colt",
    "score": 49.38,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Darryl",
    "score": 49.08,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Maisie",
    "score": 48.77,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Amber",
    "score": 48.46,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Barley",
    "score": 48.15,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bea",
    "score": 47.85,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Belle",
    "score": 47.54,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Berry",
    "score": 47.23,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Byron",
    "score": 46.92,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Chester",
    "score": 46.31,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Larry & Lawrie",
    "score": 46.18,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Cordelius",
    "score": 46.0,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Lou",
    "score": 45.79,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Crow",
    "score": 45.69,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Bonnie",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Buzz",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Draco",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Dynamike",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Griff",
    "score": 45.38,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "El Primo",
    "score": 45.08,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Fang",
    "score": 44.77,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Finx",
    "score": 44.46,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Frank",
    "score": 44.15,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gene",
    "score": 43.85,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gigi",
    "score": 43.54,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Glowy",
    "score": 43.23,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Gus",
    "score": 42.92,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Hank",
    "score": 42.62,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Janet",
    "score": 42.31,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Jae-yong",
    "score": 42.0,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Kenji",
    "score": 41.69,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Kit",
    "score": 41.38,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Shade",
    "score": 40.98,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Lily",
    "score": 40.77,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Lola",
    "score": 40.46,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Lumi",
    "score": 40.15,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Meeple",
    "score": 39.54,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Meg",
    "score": 39.23,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Melodie",
    "score": 38.92,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mina",
    "score": 38.62,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Moe",
    "score": 38.31,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mortis",
    "score": 38.0,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Mr. P",
    "score": 37.69,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Najia",
    "score": 37.38,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Nani",
    "score": 37.08,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Otis",
    "score": 36.77,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Pam",
    "score": 36.46,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "R-t",
    "score": 36.15,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Rosa",
    "score": 35.85,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Ruffs",
    "score": 35.54,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Sam",
    "score": 35.23,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Shelly",
    "score": 34.62,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Sirius",
    "score": 34.31,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Squeak",
    "score": 34.0,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Trunk",
    "score": 33.69,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Ziggy",
    "score": 33.38,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Pierce",
    "score": 33.08,
    "tier": "B"
  },
  {
    "map": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawler": "Alli",
    "score": 32.77,
    "tier": "B"
  }
];

export const mapSummaries: MapSummary[] = [
  {
    "name": "Belle's Rock",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawlerCount": 105,
    "topScore": 74.94,
    "tiers": {
      "S": 0,
      "A": 5,
      "B": 100
    }
  },
  {
    "name": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist",
    "brawlerCount": 105,
    "topScore": 72.12,
    "tiers": {
      "S": 0,
      "A": 4,
      "B": 101
    }
  },
  {
    "name": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawlerCount": 105,
    "topScore": 69.89,
    "tiers": {
      "S": 0,
      "A": 4,
      "B": 101
    }
  },
  {
    "name": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawlerCount": 105,
    "topScore": 73.6,
    "tiers": {
      "S": 0,
      "A": 5,
      "B": 100
    }
  },
  {
    "name": "Deathcap Trap",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawlerCount": 105,
    "topScore": 75.04,
    "tiers": {
      "S": 1,
      "A": 3,
      "B": 101
    }
  },
  {
    "name": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawlerCount": 105,
    "topScore": 68.46,
    "tiers": {
      "S": 0,
      "A": 2,
      "B": 103
    }
  },
  {
    "name": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawlerCount": 105,
    "topScore": 76.12,
    "tiers": {
      "S": 1,
      "A": 3,
      "B": 101
    }
  },
  {
    "name": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawlerCount": 105,
    "topScore": 73.44,
    "tiers": {
      "S": 0,
      "A": 4,
      "B": 101
    }
  },
  {
    "name": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout",
    "brawlerCount": 105,
    "topScore": 68.46,
    "tiers": {
      "S": 0,
      "A": 2,
      "B": 103
    }
  },
  {
    "name": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawlerCount": 105,
    "topScore": 68.46,
    "tiers": {
      "S": 0,
      "A": 2,
      "B": 103
    }
  },
  {
    "name": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab",
    "brawlerCount": 105,
    "topScore": 73.18,
    "tiers": {
      "S": 0,
      "A": 4,
      "B": 101
    }
  },
  {
    "name": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawlerCount": 105,
    "topScore": 77.14,
    "tiers": {
      "S": 1,
      "A": 3,
      "B": 101
    }
  },
  {
    "name": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist",
    "brawlerCount": 105,
    "topScore": 78.54,
    "tiers": {
      "S": 1,
      "A": 3,
      "B": 101
    }
  },
  {
    "name": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawlerCount": 105,
    "topScore": 72.46,
    "tiers": {
      "S": 0,
      "A": 4,
      "B": 101
    }
  },
  {
    "name": "Open Business",
    "mode": "Roubo",
    "modeId": "heist",
    "brawlerCount": 105,
    "topScore": 71.26,
    "tiers": {
      "S": 0,
      "A": 5,
      "B": 100
    }
  },
  {
    "name": "Out in the Open",
    "mode": "Caça-Estrelas",
    "modeId": "bounty",
    "brawlerCount": 105,
    "topScore": 75.94,
    "tiers": {
      "S": 1,
      "A": 4,
      "B": 100
    }
  },
  {
    "name": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone",
    "brawlerCount": 105,
    "topScore": 78.06,
    "tiers": {
      "S": 1,
      "A": 4,
      "B": 100
    }
  },
  {
    "name": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball",
    "brawlerCount": 105,
    "topScore": 75.48,
    "tiers": {
      "S": 1,
      "A": 5,
      "B": 99
    }
  }
];

export const rankedMaps = [
  {
    "name": "Belle's Rock",
    "mode": "Nocaute",
    "modeId": "knockout"
  },
  {
    "name": "Bridge Too Far",
    "mode": "Roubo",
    "modeId": "heist"
  },
  {
    "name": "Center Stage",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball"
  },
  {
    "name": "Crystal Arcade",
    "mode": "Pique-Gema",
    "modeId": "gem-grab"
  },
  {
    "name": "Deathcap Trap",
    "mode": "Pique-Gema",
    "modeId": "gem-grab"
  },
  {
    "name": "Double Swoosh",
    "mode": "Pique-Gema",
    "modeId": "gem-grab"
  },
  {
    "name": "Dry Season",
    "mode": "Caça-Estrelas",
    "modeId": "bounty"
  },
  {
    "name": "Dueling Beetles",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone"
  },
  {
    "name": "Flaring Phoenix",
    "mode": "Nocaute",
    "modeId": "knockout"
  },
  {
    "name": "Gem Fort",
    "mode": "Pique-Gema",
    "modeId": "gem-grab"
  },
  {
    "name": "Hard Rock Mine",
    "mode": "Pique-Gema",
    "modeId": "gem-grab"
  },
  {
    "name": "Hideout",
    "mode": "Caça-Estrelas",
    "modeId": "bounty"
  },
  {
    "name": "Hot Potato",
    "mode": "Roubo",
    "modeId": "heist"
  },
  {
    "name": "Layer Cake",
    "mode": "Caça-Estrelas",
    "modeId": "bounty"
  },
  {
    "name": "Open Business",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone"
  },
  {
    "name": "Out in the Open",
    "mode": "Nocaute",
    "modeId": "knockout"
  },
  {
    "name": "Parallel Plays",
    "mode": "Zona Estratégica",
    "modeId": "hot-zone"
  },
  {
    "name": "Pinball Dreams",
    "mode": "Fute-Brawl",
    "modeId": "brawl-ball"
  }
] as const;

/** Rotação Ranked confirmada pelo TopBrawl para a temporada atual (26 mapas: Beach Ball entrou; Pit Stop, Safe(r) Zone e Rustic Arcade saíram). */
export const currentRankedMapNames = [
  "Hard Rock Mine", "Gem Fort", "Hideout", "Hot Potato", "Bridge Too Far", "Layer Cake",
  "Dry Season", "Double Swoosh", "Pinball Dreams", "Center Stage", "Open Business", "Parallel Plays",
  "Dueling Beetles", "Belle's Rock", "Flaring Phoenix", "Out in the Open", "Undermine",
  "Kaboom Canyon", "Safe Zone", "Shooting Star", "Sneaky Fields", "Spiraling Out",
  "Triple Dribble", "Ring of Fire", "New Horizons", "Beach Ball",
] as const;
export const currentRankedMapNameSet: ReadonlySet<string> = new Set(currentRankedMapNames);

const currentRankedMapEntries: readonly MapSummary[] = [
  spiralingOutMapSummary,
  { name: "Beach Ball", mode: "Fute-Brawl", modeId: "brawl-ball", brawlerCount: 106, topScore: 71.54, tiers: { S: 0, A: 1, B: 105 } },
];

const currentRankedMapCatalogEntries = currentRankedMapEntries.map(({ name, mode, modeId }) => ({ name, mode, modeId }));

export const allRankedRows: RankedRow[] = [
  ...rankedRows.filter((row) => row.map !== "Beach Ball"),
  ...additionalRankedRows,
  ...(spiralingOutRankedRows as unknown as RankedRow[]),
  ...(beachBallRankedRows as unknown as RankedRow[]),
]
  .filter((row) => currentRankedMapNameSet.has(row.map))
  .map(normalizeRankedRow);
export const allMapSummaries: MapSummary[] = [...mapSummaries, ...additionalMapSummaries, ...currentRankedMapEntries]
  .filter((map) => currentRankedMapNameSet.has(map.name))
  .map(normalizeRankedMap);
export const allRankedMaps = [...rankedMaps, ...additionalRankedMaps, ...currentRankedMapCatalogEntries]
  .filter((map) => currentRankedMapNameSet.has(map.name))
  .map(normalizeRankedMap);
export const modeOptions = ['Todos', ...Array.from(new Set(allRankedMaps.map((map) => map.mode)))];

/**
 * Brawlers já anunciados que ainda não aparecem na rotação Ranked. Estas linhas
 * pertencem somente ao catálogo público: não entram no Draft nem na média dos
 * mapas até as fontes da rotação publicarem métricas reais por mapa.
 */
export const preRankedBrawlerCatalogRows: RankedRow[] = [
  {
    map: 'Ainda não disponível',
    mode: 'Ranked',
    modeId: 'ranked',
    brawler: 'Wendy',
    score: 0,
    tier: 'B',
    brawlerId: null,
    dataStatus: 'partial',
    rankedStatus: 'unavailable',
  },
];

/** Catálogo de consulta; a pool de Draft continua limitada a allRankedRows. */
export const allBrawlerCatalogRows: RankedRow[] = [...allRankedRows, ...preRankedBrawlerCatalogRows];

/**
 * Linhas destinadas somente à tabela por mapa. Wendy é apresentada no fim de
 * cada mapa enquanto não existirem métricas Ranked publicadas, sem entrar na
 * pool, nas médias ou na cobertura estatística. Quando a snapshot a publicar,
 * a linha real substitui automaticamente este marcador.
 */
export function buildMapDisplayRows(
  sourceRows: readonly RankedRow[],
  maps: readonly MapSummary[],
  winRateWeight = WIN_RATE_HYBRID_WEIGHT,
  topBrawlWeight = TOPBRAWL_SOURCE_WEIGHT,
): RankedRow[] {
  const rowsByMap = new Map<string, RankedRow[]>();
  for (const row of normalizeRankedRows(sourceRows, winRateWeight, topBrawlWeight)) {
    const rows = rowsByMap.get(row.map) ?? [];
    rows.push(row);
    rowsByMap.set(row.map, rows);
  }

  return maps.flatMap((sourceMap) => {
    const map = normalizeRankedMap(sourceMap);
    const rows = rowsByMap.get(map.name) ?? [];
    const hasPublishedWendy = rows.some((row) => row.brawler.trim().toLocaleLowerCase("pt-PT") === "wendy");
    if (hasPublishedWendy) return rows;

    return [...rows, {
      map: map.name,
      mode: map.mode,
      modeId: map.modeId,
      brawler: "Wendy",
      score: 0,
      tier: null,
      brawlerId: null,
      dataStatus: "partial",
      rankedStatus: "unavailable",
    }];
  });
}

export const crystalArcadeUsage: Record<string, number> = {
  "Bolt": 4.31,
  "Ash": 4.2,
  "Buster": 1.98,
  "Ollie": 1.57,
  "Tara": 15.71,
  "Clancy": 3.53,
  "Janet": 3.0,
  "Bo": 19.68,
  "Sandy": 4.79,
  "Damian": 4.49,
  "Pam": 1.82,
  "Mr. P": 2.76,
  "Carl": 7.57,
  "Kenji": 8.5,
  "R-T": 0.92,
  "Griff": 22.91,
  "Emz": 19.02,
  "Mortis": 25.39,
  "Nita": 4.76,
  "Doug": 2.37,
  "Gus": 3.74,
  "Surge": 20.58,
  "Meg": 16.34,
  "Juju": 0.76,
  "Hank": 1.25,
  "Sirius": 3.06,
  "Bibi": 8.37,
  "Stu": 13.29,
  "Starr Nova": 9.2,
  "8-Bit": 10.01,
  "Amber": 2.94,
  "Bull": 5.82,
  "Spike": 11.16,
  "Pearl": 3.78,
  "Edgar": 21.73,
  "Gale": 3.43,
  "Darryl": 3.52,
  "Gray": 1.97,
  "Lola": 1.11,
  "Mina": 1.75,
  "Charlie": 1.55,
  "Mandy": 3.74,
  "Ruffs": 1.45,
  "Draco": 1.65,
  "Trunk": 0.9,
  "Finx": 1.25,
  "Crow": 9.6,
  "Otis": 1.75,
  "Chester": 4.5,
  "Jessie": 4.25,
  "Eve": 0.85,
  "Moe": 1.0,
  "Kaze": 3.5,
  "Lily": 5.85,
  "Cordelius": 4.25,
  "Fang": 6.3,
  "Gigi": 0.45,
  "Bonnie": 1.1,
  "Lumi": 1.75,
  "Sam": 0.8,
  "Buzz": 3.2,
  "Mico": 1.3,
  "Penny": 3.15,
  "Lou": 1.25,
  "Larry & Lawrie": 1.05,
  "Melodie": 1.15,
  "Gene": 2.15,
  "Leon": 6.05,
  "Jae-Yong": 0.9,
  "Alli": 1.6,
  "Maisie": 1.35,
  "Poco": 4.25,
  "Glowy": 0.4,
  "Kit": 5.0,
  "Max": 1.85,
  "Rosa": 1.45,
  "Pierce": 0.95,
  "Colette": 3.25,
  "Bea": 2.65,
  "Jacky": 1.25,
  "Squeak": 4.0,
  "Meeple": 1.4,
  "Rico": 6.6,
  "Shade": 1.75,
  "Frank": 3.0,
  "Byron": 4.15,
  "Nori": 0.65,
  "Berry": 1.35,
  "Grom": 1.65,
  "Belle": 1.2,
  "Chuck": 0.8,
  "Shelly": 2.8,
  "Tick": 5.25,
  "Ziggy": 0.4,
  "Brock": 4.25,
  "Colt": 5.5,
  "Willow": 0.8,
  "Dynamike": 5.85,
  "Najia": 0.5,
  "Piper": 3.15,
  "Nani": 1.05,
  "El Primo": 2.05,
  "Barley": 1.65,
  "Sprout": 0.5,
  "Angelo": 0.5,
};
