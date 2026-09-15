export type ObservedMatchupRow = {
  map: string;
  mode: string;
  brawler: string;
  opponent: string;
  wins: number;
  losses: number;
  samples: number;
};

export type ObservedMatchupFilter = {
  map?: string;
  mode?: string;
};

export type ObservedMatchupResult = {
  brawler: string;
  opponent: string;
  wins: number;
  losses: number;
  samples: number;
  winRate: number | null;
  hasSufficientSample: boolean;
  minimumSample: number;
};

function normalized(value: string) {
  return value.trim().toLocaleUpperCase("pt-PT").replace(/\s+/g, " ");
}

function matchesFilter(row: ObservedMatchupRow, filter: ObservedMatchupFilter) {
  return (!filter.map || row.map === filter.map) && (!filter.mode || row.mode === filter.mode);
}

/**
 * Consolida apenas confrontos publicados pelo coletor. Cada linha representa
 * o resultado da equipa inteira numa partida Ranked; não infere duelos de lane.
 */
export function getObservedMatchup(
  rows: readonly ObservedMatchupRow[],
  brawler: string,
  opponent: string,
  filter: ObservedMatchupFilter = {},
  minimumSample = 30
): ObservedMatchupResult {
  const brawlerKey = normalized(brawler);
  const opponentKey = normalized(opponent);
  const aggregate = rows.reduce(
    (total, row) => {
      if (
        normalized(row.brawler) !== brawlerKey ||
        normalized(row.opponent) !== opponentKey ||
        !matchesFilter(row, filter)
      ) {
        return total;
      }
      total.wins += row.wins;
      total.losses += row.losses;
      return total;
    },
    { wins: 0, losses: 0 }
  );

  const samples = aggregate.wins + aggregate.losses;
  return {
    brawler,
    opponent,
    wins: aggregate.wins,
    losses: aggregate.losses,
    samples,
    winRate: samples > 0 ? (aggregate.wins / samples) * 100 : null,
    hasSufficientSample: samples >= minimumSample,
    minimumSample,
  };
}

/** Gera uma linha da matriz 105 × 105 sem preencher dados não observados. */
export function getObservedMatchupRow(
  rows: readonly ObservedMatchupRow[],
  brawler: string,
  opponents: readonly string[],
  filter: ObservedMatchupFilter = {},
  minimumSample = 30
) {
  return opponents
    .filter((opponent) => normalized(opponent) !== normalized(brawler))
    .map((opponent) => getObservedMatchup(rows, brawler, opponent, filter, minimumSample));
}

export function listObservedMaps(rows: readonly ObservedMatchupRow[]) {
  return Array.from(new Set(rows.map((row) => row.map))).sort((a, b) => a.localeCompare(b, "pt-PT"));
}

export function listObservedModes(rows: readonly ObservedMatchupRow[]) {
  return Array.from(new Set(rows.map((row) => row.mode))).sort((a, b) => a.localeCompare(b, "pt-PT"));
}
