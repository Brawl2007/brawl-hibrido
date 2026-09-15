import type { BrawlPlanetMapTeam } from "./brawlPlanetMapTeams";
import type { RosterChange, RosterState } from "./rosterDiscovery";

export type RankedSyncState = "bundled" | "running" | "success" | "partial" | "failed";

export type RankedSnapshotRow = {
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
  topBrawlScore?: number | null;
  brawlPlanetWinRate?: number | null;
  brawlPlanetPickRate?: number | null;
  brawlPlanetStarPlayer?: number | null;
  banRate?: number | null;
  counterRate?: number | null;
  dataStatus?: "complete" | "partial";
  rankedStatus?: "active" | "unavailable";
  counters?: string[];
  counteredBy?: string[];
  sources?: Array<{ label: string; url?: string; value?: number | null }>;
};

export type RankedSnapshotMap = {
  name: string;
  mode: string;
  modeId: string;
  brawlerCount: number;
  topScore: number;
  tiers: Record<"S" | "A" | "B", number>;
};

export type OfficialBrawlerSnapshot = {
  id: number;
  name: string;
};

export type RankedSnapshotPayload = {
  rows: RankedSnapshotRow[];
  maps: RankedSnapshotMap[];
  mapTeams: BrawlPlanetMapTeam[];
  /** Catálogo oficial mais recente, quando BRAWL_STARS_API_KEY estiver configurada. */
  officialBrawlers?: OfficialBrawlerSnapshot[];
  /**
   * Estado da deteção automática de mapas e brawlers: o que está ativo, o que
   * acabou de entrar e ainda recolhe dados, e o que está prestes a sair. Ausente
   * nas snapshots gravadas antes desta funcionalidade — os leitores tratam a
   * ausência como "ainda não avaliado", nunca como "está vazio".
   */
  roster?: RosterState;
  /** O que mudou na última avaliação, para a interface poder dizê-lo. */
  rosterChanges?: RosterChange[];
  updatedAt: string;
  sourceStatus: { topBrawl: string; brawlPlanet: string };
};

export type RankedSnapshotEvent = {
  version: string;
  capturedAt: string | null;
  syncState: RankedSyncState;
  nextRefreshAt: string | null;
  sourceStatus: { topBrawl: string; brawlPlanet: string };
  sourceNotes?: string | null;
  rowCount: number;
  payload: RankedSnapshotPayload;
};

export function parseRankedSnapshotEvent(data: string): RankedSnapshotEvent {
  const parsed = JSON.parse(data) as RankedSnapshotEvent;
  if (!parsed || typeof parsed !== "object" || typeof parsed.version !== "string" || !parsed.payload || !Array.isArray(parsed.payload.rows)) {
    throw new Error("Payload Ranked SSE inválido");
  }
  return parsed;
}

/** O push é a fonte primária: um evento válido substitui o estado atual sem invalidar escolhas locais do Draft. */
export function applyRankedSnapshotPush(current: RankedSnapshotEvent | undefined, next: RankedSnapshotEvent) {
  if (!current) return next;
  if (current.version === next.version && current.capturedAt === next.capturedAt) return current;
  return next;
}
