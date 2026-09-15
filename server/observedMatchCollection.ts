import { createHash } from "node:crypto";
import {
  fetchOfficialBattleLog,
  fetchOfficialRankedPlayers,
  type OfficialBattleLogEntry,
} from "./brawlStarsApi";
import {
  createObservedMatchCollectionRun,
  recordObservedBattle,
  updateObservedMatchCollectionConfig,
  updateObservedMatchCollectionRun,
  type ObservedMatchupDelta,
} from "./db";
import { RANKED_MAP_SOURCES } from "./rankedSync";

const MAX_PLAYERS_PER_RUN = 12;
const CONCURRENCY = 3;

export type ObservedCollectionTrigger = "scheduled" | "manual" | "bootstrap";
export type NormalizedObservedBattle = {
  fingerprint: string;
  battleTime: Date;
  mapId: string;
  mode: string;
  eventType: string;
  winningTeam: string[];
  losingTeam: string[];
  sourcePlayerTag: string;
  deltas: ObservedMatchupDelta[];
};

function normalizeBrawlerName(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function normalizeObservedMode(value: string | undefined) {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function resolveObservedMapId(mapName: string) {
  return RANKED_MAP_SOURCES.find(([name]) => name.toLocaleLowerCase() === mapName.toLocaleLowerCase())?.[1] ?? null;
}

function normalizeTeam(team: Array<{ brawler?: { name?: string } }>) {
  return team.map(member => normalizeBrawlerName(member.brawler?.name)).filter(Boolean).sort();
}

function teamContainsPlayer(team: Array<{ tag?: string }>, tag: string) {
  return team.some(member => member.tag?.toLocaleUpperCase() === tag.toLocaleUpperCase());
}

function parseBattleTime(value: string | undefined) {
  if (!value || !/^\d{8}T\d{6}\.\d{3}Z$/.test(value)) return null;
  const normalized = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}.${value.slice(16, 19)}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createMatchupDeltas(
  mapId: string,
  mode: string,
  winners: readonly string[],
  losers: readonly string[]
) {
  const deltas: ObservedMatchupDelta[] = [];
  for (const winner of winners) {
    for (const loser of losers) {
      deltas.push({ mapId, mode, brawler: winner, opponent: loser, wins: 1, losses: 0 });
      deltas.push({ mapId, mode, brawler: loser, opponent: winner, wins: 0, losses: 1 });
    }
  }
  return deltas;
}

/** Aceita somente resultado Ranked com duas equipas e vencedor identificável pela fonte observada. */
export function normalizeObservedBattle(
  entry: OfficialBattleLogEntry,
  sourcePlayerTag: string
): NormalizedObservedBattle | null {
  const battle = entry.battle;
  const event = entry.event;
  const result = battle?.result?.toLowerCase();
  if (battle?.type?.toLowerCase() !== "ranked" || (result !== "victory" && result !== "defeat")) return null;
  if (!event?.id || !event.mode || !Array.isArray(battle.teams) || battle.teams.length !== 2) return null;

  const sourceTeamIndex = battle.teams.findIndex(team => teamContainsPlayer(team, sourcePlayerTag));
  if (sourceTeamIndex < 0) return null;
  const battleTime = parseBattleTime(entry.battleTime);
  if (!battleTime) return null;

  const sourceTeam = normalizeTeam(battle.teams[sourceTeamIndex]);
  const otherTeam = normalizeTeam(battle.teams[sourceTeamIndex === 0 ? 1 : 0]);
  if (!sourceTeam.length || !otherTeam.length) return null;
  const sourceWon = result === "victory";
  const winningTeam = sourceWon ? sourceTeam : otherTeam;
  const losingTeam = sourceWon ? otherTeam : sourceTeam;
  const mapId = String(event.id);
  const mode = normalizeObservedMode(event.mode);
  const fingerprintPayload = [
    battleTime.toISOString(),
    mapId,
    mode,
    winningTeam.join(","),
    losingTeam.join(","),
  ].join("|");

  return {
    fingerprint: createHash("sha256").update(fingerprintPayload).digest("hex"),
    battleTime,
    mapId,
    mode,
    eventType: battle.type,
    winningTeam,
    losingTeam,
    sourcePlayerTag,
    deltas: createMatchupDeltas(mapId, mode, winningTeam, losingTeam),
  };
}

async function mapWithConcurrency<T, R>(items: readonly T[], task: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      results.push(await task(item));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

export async function collectObservedRankedMatches(trigger: ObservedCollectionTrigger) {
  const runId = await createObservedMatchCollectionRun(trigger);
  const startedAt = new Date();
  await updateObservedMatchCollectionConfig({ lastStatus: "running", lastStartedAt: startedAt, lastError: null });

  try {
    const players = (await fetchOfficialRankedPlayers())
      .map(player => player.tag?.trim())
      .filter((tag): tag is string => Boolean(tag))
      .slice(0, MAX_PLAYERS_PER_RUN);
    if (!players.length) throw new Error("A API oficial não devolveu jogadores Ranked para a amostra.");

    const logs = await mapWithConcurrency(players, async tag => ({ tag, entries: await fetchOfficialBattleLog(tag) }));
    const candidates = logs.flatMap(({ tag, entries }) =>
      entries.map(entry => normalizeObservedBattle(entry, tag)).filter((battle): battle is NormalizedObservedBattle => Boolean(battle))
    );

    let battlesInserted = 0;
    let pairObservations = 0;
    for (const candidate of candidates) {
      const inserted = await recordObservedBattle(
        {
          fingerprint: candidate.fingerprint,
          battleTime: candidate.battleTime,
          mapId: candidate.mapId,
          mode: candidate.mode,
          eventType: candidate.eventType,
          winningTeam: JSON.stringify(candidate.winningTeam),
          losingTeam: JSON.stringify(candidate.losingTeam),
          sourcePlayerTag: candidate.sourcePlayerTag,
        },
        candidate.deltas
      );
      if (inserted) {
        battlesInserted += 1;
        pairObservations += candidate.deltas.length;
      }
    }

    const completedAt = new Date();
    await updateObservedMatchCollectionRun(runId ?? 0, {
      status: "success",
      playersSampled: players.length,
      battlesFetched: logs.reduce((total, log) => total + log.entries.length, 0),
      battlesInserted,
      pairObservations,
      completedAt,
    });
    await updateObservedMatchCollectionConfig({ lastStatus: "success", lastCompletedAt: completedAt, lastError: null });
    return { ok: true as const, playersSampled: players.length, battlesInserted, pairObservations };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido na coleta observada";
    const completedAt = new Date();
    await updateObservedMatchCollectionRun(runId ?? 0, { status: "failed", completedAt, error: message });
    await updateObservedMatchCollectionConfig({ lastStatus: "failed", lastCompletedAt: completedAt, lastError: message });
    return { ok: false as const, error: message };
  }
}
