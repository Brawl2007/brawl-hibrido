import { getCounterSnapshotBrawlers, normalizeCounterBrawlerName, type CounterSyncSnapshotPayload } from "./counterSyncSnapshot";
import {
  getBrawlerBuild,
  getCounterProfile,
  inferDraftRole,
  type CounterProfile,
  type DraftRole,
} from "./draft";

export type BrawlerCatalogRow = {
  map: string;
  mode: string;
  modeId: string;
  brawler: string;
  score: number | null;
  tier: "S" | "A" | "B" | null;
  brawlerId?: number | null;
  usage?: number | null;
  winRate?: number | null;
  topBrawlWinRate?: number | null;
  topBrawlUseRate?: number | null;
  brawlPlanetWinRate?: number | null;
  brawlPlanetPickRate?: number | null;
  banRate?: number | null;
  rankedStatus?: 'active' | 'unavailable';
};

export type BrawlerCatalogItem = {
  brawler: string;
  brawlerId: number | null;
  role: DraftRole;
  profile: CounterProfile;
  bestRow: BrawlerCatalogRow;
  build: ReturnType<typeof getBrawlerBuild> | null;
  winRate: number | null;
  usageRate: number | null;
  isRankedAvailable: boolean;
};

export const normalizeBrawlerCatalogName = normalizeCounterBrawlerName;

function numeric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rowQuality(row: BrawlerCatalogRow) {
  const score = numeric(row.score) ?? 0;
  const winRate = numeric(row.brawlPlanetWinRate) ?? numeric(row.topBrawlWinRate) ?? numeric(row.winRate) ?? 0;
  const usage = numeric(row.usage) ?? numeric(row.brawlPlanetPickRate) ?? numeric(row.topBrawlUseRate) ?? 0;
  return score * 0.62 + winRate * 0.28 + Math.min(usage, 100) * 0.1;
}

export function buildBrawlerCatalog<T extends BrawlerCatalogRow>(rows: T[], snapshot?: CounterSyncSnapshotPayload): BrawlerCatalogItem[] {
  const roster = getCounterSnapshotBrawlers(snapshot);
  const canonical = new Map(roster.map(name => [normalizeBrawlerCatalogName(name), name]));
  const unique = new Map<string, BrawlerCatalogRow>();
  for (const original of rows) {
    const key = normalizeBrawlerCatalogName(original.brawler);
    const row = { ...original, brawler: canonical.get(key) ?? original.brawler };
    const current = unique.get(key);
    if (!current || (current.rankedStatus === "unavailable" && row.rankedStatus !== "unavailable") ||
      ((current.rankedStatus === "unavailable") === (row.rankedStatus === "unavailable") && rowQuality(row) > rowQuality(current))) unique.set(key, row);
  }

  for (const name of roster) {
    const key = normalizeBrawlerCatalogName(name);
    if (!unique.has(key)) unique.set(key, {
      brawler: name, map: "", mode: "", modeId: "", score: 0, tier: "B",
      rankedStatus: "unavailable",
    });
  }

  const names = Array.from(unique.values()).map((row) => row.brawler);
  return Array.from(unique.values())
    .map((row) => {
      const profile = getCounterProfile(row.brawler, names);
      return {
        brawler: row.brawler,
        brawlerId: row.brawlerId ?? null,
        role: inferDraftRole(row.brawler),
        profile,
        bestRow: row,
        build: row.rankedStatus === "unavailable" ? null : getBrawlerBuild(row.brawler, row.modeId),
        winRate: numeric(row.brawlPlanetWinRate) ?? numeric(row.topBrawlWinRate) ?? numeric(row.winRate),
        usageRate: numeric(row.usage) ?? numeric(row.brawlPlanetPickRate) ?? numeric(row.topBrawlUseRate),
        isRankedAvailable: row.rankedStatus !== "unavailable",
      } satisfies BrawlerCatalogItem;
    })
    .sort((a, b) => (b.bestRow.score ?? -1) - (a.bestRow.score ?? -1) || a.brawler.localeCompare(b.brawler));
}
