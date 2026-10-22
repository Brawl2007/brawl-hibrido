import { diagnosticoDasPartidas } from "./erroDasPartidas";
import { createHash } from "node:crypto";
import {
  fetchOfficialBattleLog,
  fetchOfficialRankedPlayers,
  isOfficialApiConfigured,
  type OfficialBattleLogEntry,
} from "./brawlStarsApi";
import {
  acrescentarJogadoresALista,
  createObservedMatchCollectionRun,
  getObservedMatchCollectionConfig,
  gravarLeiturasDosJogadores,
  lerEstadoDosJogadores,
  listarJogadoresNaAltura,
  recordObservedBattlesBatch,
  reservarJanelaDasPartidas,
  tirarJogadoresParados,
  updateObservedMatchCollectionConfig,
  updateObservedMatchCollectionRun,
  type ObservedMatchupDelta,
} from "./db";
import {
  LIMITE_DA_LISTA,
  LUGARES_DA_BOLA_DE_NEVE,
  TEMPO_SEM_RANKED_PARA_SAIR_MS,
  escolherLeituras,
  normalizarTag,
  proximaLeitura,
  type PartidaDoHistorico,
} from "./bolaDeNeve";
import { RANKED_MAP_SOURCES } from "./rankedSync";
import { getSetting, setSetting } from "./appSettings";
import { rankDaPartida } from "@shared/ranksDoRanked";
import { inicioDaJanelaDasPartidas, podeRecolherAgora, RECOLHA_PRESA_MS } from "@shared/agendamentoPartidas";
export { podeRecolherAgora } from "@shared/agendamentoPartidas";

/**
 * Quantos jogadores cada recolha lê, e quantos de cada vez.
 *
 * Eram 12, três a três: umas dezenas de partidas por dia, e nem essas eram do
 * modo certo (ver `TIPOS_DO_RANKED`). Com a recolha a cada 15 minutos, 120
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
 * os mesmos. Desde a v160, metade dos lugares vai para a bola de neve
 * (`bolaDeNeve.ts`): os jogadores vistos nas partidas Ranked lidas.
 */
export const PAISES_DA_RECOLHA = ["BR", "US", "MX", "FR", "DE", "ES", "IT", "PT", "TR", "KR", "JP", "PL", "AR", "CL", "CO", "PE", "GB", "UA", "ID", "PH", "VN", "TH", "SA", "EG", "MA", "CA"] as const;

/** A volta desta recolha: muda de 15 em 15 minutos, para rodar países e jogadores. */
export function voltaDaRecolha(agora = new Date()) {
  return Math.floor(agora.getTime() / 900_000);
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
  /** Nível de rank dos seis jogadores, quando a API o dá. */
  rank: { min: number; max: number; medio: number } | null;
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
    rank: rankDaPartida(battle.teams.flat().map((jogador) => jogador.brawler?.trophies)),
  };
}

/** O histórico de um jogador como a bola de neve o lê: quando foi cada partida e se era Ranked. */
export function partidasDoHistorico(entries: readonly OfficialBattleLogEntry[]): PartidaDoHistorico[] {
  return entries.flatMap((entry) => {
    const quando = parseBattleTime(entry.battleTime);
    return quando ? [{ quando, ranked: TIPOS_DO_RANKED.has(entry.battle?.type?.toLowerCase() ?? "") }] : [];
  });
}

/** Os códigos dos jogadores das partidas Ranked de um histórico — os candidatos à lista. */
export function tagsDasPartidasRanked(entries: readonly OfficialBattleLogEntry[]) {
  const tags = new Set<string>();
  for (const entry of entries) {
    if (!TIPOS_DO_RANKED.has(entry.battle?.type?.toLowerCase() ?? "")) continue;
    for (const jogador of entry.battle?.teams?.flat() ?? []) {
      const tag = normalizarTag(jogador.tag);
      if (tag) tags.add(tag);
    }
  }
  return Array.from(tags);
}

/**
 * Depois de ler: marca quando voltar a ler cada um, tira quem parou e junta à
 * lista os jogadores novos das partidas Ranked.
 */
async function atualizarBolaDeNeve(logs: ReadonlyArray<{ tag: string; entries: OfficialBattleLogEntry[] }>, agora: Date) {
  const lidos = logs.map(({ tag }) => normalizarTag(tag)).filter((tag): tag is string => Boolean(tag));
  const estado = await lerEstadoDosJogadores(lidos);
  const leituras = logs.flatMap(({ tag, entries }) => {
    const normal = normalizarTag(tag);
    if (!normal) return [];
    const anterior = estado.get(normal);
    const leitura = proximaLeitura(partidasDoHistorico(entries), anterior, agora);
    // Quem veio dos rankings só entra na lista se joga mesmo Ranked.
    return anterior || leitura.rankedNovas > 0 ? [{ tag: normal, ...leitura }] : [];
  });
  await gravarLeiturasDosJogadores(leituras);
  await tirarJogadoresParados(new Date(agora.getTime() - TEMPO_SEM_RANKED_PARA_SAIR_MS));
  const jaLidos = new Set(lidos);
  const vistos = logs.flatMap(({ entries }) => tagsDasPartidasRanked(entries)).filter((tag) => !jaLidos.has(tag));
  return acrescentarJogadoresALista(vistos, LIMITE_DA_LISTA);
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

export async function collectObservedRankedMatches(trigger: ObservedCollectionTrigger, reserva?: { startedAt: Date }) {
  let runId: number | undefined;
  const startedAt = reserva?.startedAt ?? new Date();
  try {
    runId = await createObservedMatchCollectionRun(trigger);
    if (!reserva) await updateObservedMatchCollectionConfig({ lastStatus: "running", lastStartedAt: startedAt, lastError: null });
    // Sem chave, a API devolve listas vazias em silêncio; dizê-lo evita procurar o problema no sítio errado.
    if (!isOfficialApiConfigured()) throw new Error("Sem chave da API oficial neste ambiente: guarda-a no painel do Draft (as versões de teste da Vercel não usam a base de dados de produção).");
    const volta = voltaDaRecolha(startedAt);
    // A bola de neve (ver `bolaDeNeve.ts`). Se a lista falhar, a recolha segue só com os rankings.
    const naAltura = await listarJogadoresNaAltura(startedAt, JOGADORES_POR_RECOLHA).catch((erro: unknown) => {
      console.warn("[Partidas] Lista da bola de neve não lida:", erro instanceof Error ? erro.message : erro);
      return [] as string[];
    });
    const listas = await Promise.all(["global", ...paisesDaVolta(volta)].map((pais) => fetchOfficialRankedPlayers(pais)));
    const dosRankings = jogadoresDaVolta(
      listas.flat().map(player => player.tag?.trim()).filter((tag): tag is string => Boolean(tag)),
      volta,
      JOGADORES_POR_RECOLHA - Math.min(naAltura.length, LUGARES_DA_BOLA_DE_NEVE),
    );
    const escolha = escolherLeituras(dosRankings, naAltura, JOGADORES_POR_RECOLHA);
    const players = escolha.tags;
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
    await guardarNomesDosMapas(logs.flatMap(({ entries }) => entries)).catch(() => undefined);
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
        rank: candidate.rank,
      })),
    );
    const bolaDeNeve = await atualizarBolaDeNeve(logs, startedAt).catch((erro: unknown) => {
      console.warn("[Partidas] Bola de neve não atualizada:", erro instanceof Error ? erro.message : erro);
      return { acrescentados: 0, naLista: null as number | null };
    });
    /** Os níveis de rank vistos, para confirmar a correspondência com os ranks no ar. */
    const niveisVistos: Record<string, number> = {};
    for (const candidate of candidates) {
      const chave = candidate.rank ? String(candidate.rank.medio) : "sem rank";
      niveisVistos[chave] = (niveisVistos[chave] ?? 0) + 1;
    }

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
    const resumoDaBola = { lidosDaLista: escolha.daLista, lidosDosRankings: escolha.dosRankings, ...bolaDeNeve };
    console.log(`[Partidas] ${logs.length} jogadores lidos · ${candidates.length} partidas Ranked · ${battlesInserted} novas · bola de neve: ${JSON.stringify(resumoDaBola)} · tipos: ${JSON.stringify(tiposVistos)}`);
    return { ok: true as const, playersSampled: logs.length, rankedFound: candidates.length, battlesInserted, pairObservations, tiposVistos, niveisVistos, bolaDeNeve: resumoDaBola };
  } catch (error) {
    const diagnostico = diagnosticoDasPartidas(error);
    const completedAt = new Date();
    // Se a base recusa escritas, registar a falha também pode falhar. Não perde
    // o diagnóstico original nem deixa a promessa rejeitada por esse motivo.
    const registos = await Promise.allSettled([
      updateObservedMatchCollectionRun(runId ?? 0, { status: "failed", completedAt, error: diagnostico.error }),
      updateObservedMatchCollectionConfig({ lastStatus: "failed", lastCompletedAt: completedAt, lastError: diagnostico.error }),
    ]);
    console.error("[Partidas] Recolha falhou:", diagnostico.errorCode,
      registos.some((resultado) => resultado.status === "rejected") ? "Não foi possível guardar o estado da falha." : "Estado da falha guardado.");
    return { ok: false as const, ...diagnostico };
  }
}

/** Uma volta por janela de 15 minutos. A base arbitra chamadas concorrentes. */
export async function recolherSeForAltura(trigger: ObservedCollectionTrigger = "scheduled") {
  if (!isOfficialApiConfigured()) return { ok: false as const, errorCode: "OFFICIAL_API_NOT_CONFIGURED", error: "Sem chave da API oficial para recolher partidas." };
  const startedAt = new Date();
  let reservada: boolean;
  try {
    reservada = await reservarJanelaDasPartidas(inicioDaJanelaDasPartidas(startedAt), startedAt, new Date(startedAt.getTime() - RECOLHA_PRESA_MS));
  } catch (erro) {
    const diagnostico = diagnosticoDasPartidas(erro);
    console.error("[Partidas] Reserva falhou:", diagnostico.errorCode);
    return { ok: false as const, etapa: "reserva" as const, ...diagnostico };
  }
  if (!reservada) {
    const config = await getObservedMatchCollectionConfig();
    const altura = podeRecolherAgora(config, startedAt);
    return { ok: false as const, saltada: true as const,
      motivo: altura.pode ? "Outra chamada reservou esta janela de 15 minutos." : altura.motivo,
      proximaPrevista: altura.proximaPrevista };
  }
  return collectObservedRankedMatches(trigger, { startedAt });
}

/**
 * Nome de cada mapa, pelo número que a API lhe dá.
 *
 * A partida guarda só o número do mapa. A lista de mapas do projeto conhece os
 * da rotação, mas a rotação muda — e um mapa novo aparecia na página como
 * «Mapa 15000xxx». A API diz o nome em cada partida; guarda-se aqui.
 */
export const NOMES_DOS_MAPAS_SETTING = "nomesDosMapasObservados";

export async function lerNomesDosMapas(): Promise<Record<string, string>> {
  try {
    const guardado = await getSetting(NOMES_DOS_MAPAS_SETTING);
    const lido = guardado ? JSON.parse(guardado) : {};
    return lido && typeof lido === "object" ? lido as Record<string, string> : {};
  } catch {
    return {};
  }
}

async function guardarNomesDosMapas(entradas: readonly OfficialBattleLogEntry[]) {
  const novos: Record<string, string> = {};
  for (const entrada of entradas) {
    const id = entrada.event?.id;
    const nome = entrada.event?.map?.trim();
    if (id && nome) novos[String(id)] = nome;
  }
  if (!Object.keys(novos).length) return;
  const atuais = await lerNomesDosMapas();
  if (Object.entries(novos).every(([id, nome]) => atuais[id] === nome)) return;
  await setSetting(NOMES_DOS_MAPAS_SETTING, JSON.stringify({ ...atuais, ...novos }));
}

