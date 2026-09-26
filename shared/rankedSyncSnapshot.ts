import type { BrawlPlanetMapTeam } from "./brawlPlanetMapTeams";
import type { LeituraPorFonte } from "./idadeDosDados";
import type { RosterChange, RosterState } from "./rosterDiscovery";
import type { ElosNaSnapshot, PorElo } from "./elosBrawlPlanet";

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
  /** Brawl Planet por elo (Diamond, Mythic, Legendary). Ver `shared/elosBrawlPlanet.ts`. */
  brawlPlanetPorElo?: PorElo;
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
  /**
   * Quando cada fonte foi mesmo lida na origem — que não é a hora desta
   * sincronização. Ver `shared/idadeDosDados.ts`. Ausente nas snapshots
   * gravadas antes disto existir: quem lê trata a ausência como "não se sabe",
   * nunca como "foi agora".
   */
  /** Números do Brawl Planet por elo. Ausente nas snapshots anteriores: aí só há All ranks. */
  elosBrawlPlanet?: ElosNaSnapshot;
  sourceReadAt?: LeituraPorFonte;
};

export type RankedSnapshotEvent = {
  version: string;
  capturedAt: string | null;
  syncState: RankedSyncState;
  nextRefreshAt: string | null;
  sourceStatus: { topBrawl: string; brawlPlanet: string };
  sourceNotes?: string | null;
  /** Ver `RankedSnapshotPayload.sourceReadAt`. */
  sourceReadAt?: LeituraPorFonte;
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

/**
 * Qual das duas snapshots fica no ecrã: a mais recente, venha de onde vier.
 *
 * A snapshot chega por dois caminhos — a consulta e a stream — e o cliente
 * usava só a stream a partir do primeiro envio dela. Na Vercel a stream só se
 * religa de 5 em 5 minutos, e "Atualizar agora" refresca pela consulta: a
 * resposta nova era deitada fora e o ecrã ficava com a snapshot anterior. Foi
 * assim que os elos do Brawl Planet (v130) ficaram cinzentos depois de uma
 * recolha que os tinha lido.
 *
 * Mais recente é o `capturedAt` maior. Sem data (a base incluída no projeto)
 * perde sempre para uma com data. Empate fica com a atual: não se redesenha o
 * ecrã por nada.
 */
export function applyRankedSnapshotPush(current: RankedSnapshotEvent | undefined, next: RankedSnapshotEvent) {
  if (!current) return next;
  if (current.version === next.version && current.capturedAt === next.capturedAt) return current;
  const quando = (evento: RankedSnapshotEvent) => {
    const t = evento.capturedAt ? Date.parse(evento.capturedAt) : NaN;
    return Number.isFinite(t) ? t : -Infinity;
  };
  return quando(next) > quando(current) ? next : current;
}
