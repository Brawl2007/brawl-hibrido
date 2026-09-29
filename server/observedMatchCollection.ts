import { createHash } from "node:crypto";
import {
  fetchOfficialBattleLog,
  fetchOfficialRankedPlayers,
  type OfficialBattleLogEntry,
} from "./brawlStarsApi";
import {
  createObservedMatchCollectionRun,
  getObservedMatchCollectionConfig,
  recordObservedBattlesBatch,
  updateObservedMatchCollectionConfig,
  updateObservedMatchCollectionRun,
  type ObservedMatchupDelta,
} from "./db";
import { RANKED_MAP_SOURCES } from "./rankedSync";

/**
 * Quantos jogadores cada recolha lê, e quantos de cada vez.
 *
 * Eram 12, três a três: umas dezenas de partidas por dia, e nem essas eram do
 * modo certo (ver `TIPOS_DO_RANKED`). Com a recolha de hora a hora, 120
 * jogadores por volta dão milhares de partidas por semana. O limite de tempo
 * garante que a função da Vercel acaba sempre a tempo de gravar.
 */
export const JOGADORES_POR_RECOLHA = 120;
const CONCURRENCY = 8;
const TEMPO_MAXIMO_A_LER_MS = 35_000;

/**
 * Os tipos de batalha do modo Ranked na API oficial.
 *
 * POR QUE ISTO ESTÁ ESCRITO
 *
 * Na API, `"ranked"` NÃO é o modo Ranked: é o nome antigo dos jogos de
 * troféus. O modo competitivo com draft (o antigo Power League) chama-se
 * `soloRanked` quando se entra sozinho e `teamRanked` em equipa. A recolha
 * antiga aceitava só `"ranked"` e recusava `soloRanked` — juntava jogos de
 * troféus e deitava fora os do Ranked.
 */
export const TIPOS_DO_RANKED = new Set(["soloranked", "teamranked"]);

/**
 * Onde ir buscar jogadores. Os melhores de cada país jogam o Ranked de topo;
 * cada recolha usa o global mais três países, em rotação, para não ler sempre
 * os mesmos.
 */
export const PAISES_DA_RECOLHA = ["BR", "US", "MX", "FR", "DE", "ES", "IT", "PT", "TR", "KR", "JP", "PL", "AR", "CL", "CO", "PE", "GB", "UA", "ID", "PH", "VN", "TH", "SA", "EG", "MA", "CA"] as const;

/** A volta desta recolha: muda de hora a hora, para rodar países e jogadores. */
export function voltaDaRecolha(agora = new Date()) {
  return Math.floor(agora.getTime() / 3_600_000);
}

export function paisesDaVolta(volta: number, quantos = 3) {
  return Array.from({ length: quantos }, (_, i) => PAISES_DA_RECOLHA[(volta * quantos + i) % PAISES_DA_RECOLHA.length]);
}

/** Uma fatia do conjunto de jogadores, diferente a cada volta, sem repetidos. */
export function jogadoresDaVolta(tags: readonly string[], volta: number, quantos = JOGADORES_POR_RECOLHA) {
  const unicos = Array.from(new Set(tags.map((tag) => tag.trim().toUpperCase()).filter(Boolean)));
  if (unicos.length <= quantos) return unicos;
  const inicio = (volta * quantos) % unicos.length;
  return Array.from({ length: quantos }, (_, i) => unicos[(inicio + i) % unicos.length]);
}

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
  if (!battle?.type || !TIPOS_DO_RANKED.has(battle.type.toLowerCase()) || (result !== "victory" && result !== "defeat")) return null;
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

async function mapWithConcurrency<T, R>(items: readonly T[], task: (item: T) => Promise<R>, prazo = Number.POSITIVE_INFINITY) {
  const results: R[] = [];
  let cursor = 0;
  const worker = async () => {
    // Passado o prazo, não se começa nenhum pedido novo: o que já foi lido grava-se.
    while (cursor < items.length && Date.now() < prazo) {
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
    const volta = voltaDaRecolha(startedAt);
    const listas = await Promise.all(["global", ...paisesDaVolta(volta)].map((pais) => fetchOfficialRankedPlayers(pais)));
    const players = jogadoresDaVolta(
      listas.flat().map(player => player.tag?.trim()).filter((tag): tag is string => Boolean(tag)),
      volta,
    );
    if (!players.length) throw new Error("A API oficial não devolveu jogadores para a amostra.");

    const prazo = Date.now() + TEMPO_MAXIMO_A_LER_MS;
    const logs = await mapWithConcurrency(players, async tag => ({ tag, entries: await fetchOfficialBattleLog(tag) }), prazo);
    /**
     * Que tipos de batalha a API devolveu, para se poder confirmar no ar que o
     * Ranked está mesmo a ser apanhado (e não os jogos de troféus).
     */
    const tiposVistos: Record<string, number> = {};
    for (const { entries } of logs) {
      for (const entry of entries) {
        const tipo = entry.battle?.type ?? "sem tipo";
        tiposVistos[tipo] = (tiposVistos[tipo] ?? 0) + 1;
      }
    }
    const candidates = logs.flatMap(({ tag, entries }) =>
      entries.map(entry => normalizeObservedBattle(entry, tag)).filter((battle): battle is NormalizedObservedBattle => Boolean(battle))
    );

    const { battlesInserted, pairObservations } = await recordObservedBattlesBatch(
      candidates.map(candidate => ({
        battle: {
          fingerprint: candidate.fingerprint,
          battleTime: candidate.battleTime,
          mapId: candidate.mapId,
          mode: candidate.mode,
          eventType: candidate.eventType,
          winningTeam: JSON.stringify(candidate.winningTeam),
          losingTeam: JSON.stringify(candidate.losingTeam),
          sourcePlayerTag: candidate.sourcePlayerTag,
        },
        deltas: candidate.deltas,
      })),
    );

    const completedAt = new Date();
    await updateObservedMatchCollectionRun(runId ?? 0, {
      status: "success",
      playersSampled: logs.length,
      battlesFetched: logs.reduce((total, log) => total + log.entries.length, 0),
      battlesInserted,
      pairObservations,
      completedAt,
    });
    await updateObservedMatchCollectionConfig({ lastStatus: "success", lastCompletedAt: completedAt, lastError: null });
    console.log(`[Partidas] ${logs.length} jogadores lidos · ${candidates.length} partidas Ranked · ${battlesInserted} novas · tipos: ${JSON.stringify(tiposVistos)}`);
    return { ok: true as const, playersSampled: logs.length, rankedFound: candidates.length, battlesInserted, pairObservations, tiposVistos };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido na coleta observada";
    const completedAt = new Date();
    await updateObservedMatchCollectionRun(runId ?? 0, { status: "failed", completedAt, error: message });
    await updateObservedMatchCollectionConfig({ lastStatus: "failed", lastCompletedAt: completedAt, lastError: message });
    return { ok: false as const, error: message };
  }
}

/**
 * Quanto tempo entre duas recolhas pedidas de fora.
 *
 * O endereço que dispara a recolha é público — é o que deixa o GitHub Actions
 * chamá-lo de hora a hora sem guardar segredos em lado nenhum. O que impede
 * abusos é isto: pedido antes do tempo, não faz nada e diz quando pode.
 */
export const INTERVALO_MINIMO_ENTRE_RECOLHAS_MS = 45 * 60_000;
const RECOLHA_PRESA_MS = 10 * 60_000;

export function podeRecolherAgora(
  config: { lastStatus?: string | null; lastStartedAt?: Date | string | null } | undefined,
  agora = new Date(),
) {
  const inicio = config?.lastStartedAt ? new Date(config.lastStartedAt).getTime() : 0;
  const passou = agora.getTime() - inicio;
  if (config?.lastStatus === "running" && passou < RECOLHA_PRESA_MS) {
    return { pode: false as const, motivo: "Já há uma recolha a correr." };
  }
  if (inicio && passou < INTERVALO_MINIMO_ENTRE_RECOLHAS_MS) {
    const faltam = Math.ceil((INTERVALO_MINIMO_ENTRE_RECOLHAS_MS - passou) / 60_000);
    return { pode: false as const, motivo: `A última recolha foi há ${Math.floor(passou / 60_000)} min. A próxima pode ser daqui a ${faltam} min.` };
  }
  return { pode: true as const };
}

/** A recolha pedida de fora (GitHub Actions ou cron), com o intervalo mínimo. */
export async function recolherSeForAltura(trigger: ObservedCollectionTrigger = "scheduled") {
  const config = await getObservedMatchCollectionConfig();
  const altura = podeRecolherAgora(config);
  if (!altura.pode) return { ok: false as const, saltada: true as const, motivo: altura.motivo };
  return collectObservedRankedMatches(trigger);
}
