/**
 * Acesso à base das partidas compactas (v182). Só leituras e gravações; as
 * regras (migração, dedupe da recolha, resumos) ficam nos módulos que o usam.
 * O formato dos pacotes está em `shared/partidasCompactas.ts`.
 */
import { and, asc, count, eq, gt, gte, inArray, lt, lte, sql, sum } from "drizzle-orm";
import {
  observedBattleQuality,
  observedBattleRanks,
  observedBattles,
  observedBattlePacks,
  observedSummaryCache,
} from "../drizzle/schema";
import {
  chaveDaBatalha,
  desempacotar,
  diaDaBatalha,
  empacotar,
  semRepetidas,
  type BatalhaCompacta,
} from "@shared/partidasCompactas";
import { getDb } from "./db";

/** Partes de um mesmo mapa/modo/dia a partir das quais a recolha as junta numa. */
export const MAXIMO_DE_PARTES = 6;
/** Partidas por linha: ~30 bytes cada, cerca de 1,3 MB, bem abaixo dos limites da base. */
export const PARTIDAS_POR_LINHA = 40_000;
const PAGINA_DE_PACOTES = 20;

export type PartidaParaGravar = { mapId: string; mode: string; batalha: BatalhaCompacta };

async function db() {
  const ligacao = await getDb();
  if (!ligacao) throw new Error("Base de dados das partidas não configurada.");
  return ligacao;
}

function gruposDe(partidas: readonly PartidaParaGravar[]) {
  const grupos = new Map<string, { mapId: string; mode: string; dia: string; batalhas: BatalhaCompacta[] }>();
  for (const { mapId, mode, batalha } of partidas) {
    const dia = diaDaBatalha(batalha.t);
    const chave = `${mapId}\u0000${mode}\u0000${dia}`;
    const atual = grupos.get(chave);
    if (atual) atual.batalhas.push(batalha);
    else grupos.set(chave, { mapId, mode, dia, batalhas: [batalha] });
  }
  return [...grupos.values()];
}

function emLinhas(batalhas: readonly BatalhaCompacta[]) {
  const linhas: Array<{ partidas: number; dados: string }> = [];
  for (let i = 0; i < batalhas.length; i += PARTIDAS_POR_LINHA) {
    const fatia = batalhas.slice(i, i + PARTIDAS_POR_LINHA);
    linhas.push({ partidas: fatia.length, dados: empacotar(fatia) });
  }
  return linhas;
}

async function partesDoGrupo(ligacao: Awaited<ReturnType<typeof db>>, mapId: string, mode: string, dia: string) {
  return ligacao.select({ id: observedBattlePacks.id, dados: observedBattlePacks.dados }).from(observedBattlePacks)
    .where(and(eq(observedBattlePacks.mapId, mapId), eq(observedBattlePacks.mode, mode), eq(observedBattlePacks.dia, dia)))
    .orderBy(asc(observedBattlePacks.id));
}

/**
 * Grava partidas nos pacotes e devolve quantas eram novas.
 *
 * Com `repetidas: "descartar"` compara com o que já está guardado no mesmo
 * mapa, modo e dia (a mesma partida chega pelos vários jogadores que a jogaram).
 * Com `"ignorar"` grava tudo: serve a migração, em que o histórico antigo já
 * foi deduplicado pela base de origem.
 */
export async function gravarEmPacotes(partidas: readonly PartidaParaGravar[], repetidas: "descartar" | "ignorar" = "descartar") {
  if (!partidas.length) return { novas: 0, grupos: 0 };
  const ligacao = await db();
  let novas = 0;
  const grupos = gruposDe(partidas);
  for (const grupo of grupos) {
    let batalhas = grupo.batalhas;
    let existentes: Array<{ id: number; dados: string }> = [];
    if (repetidas === "descartar") {
      existentes = await partesDoGrupo(ligacao, grupo.mapId, grupo.mode, grupo.dia);
      const chaves = new Set<string>();
      for (const parte of existentes) for (const b of desempacotar(parte.dados)) chaves.add(chaveDaBatalha(b));
      batalhas = semRepetidas(batalhas, chaves);
    } else {
      batalhas = semRepetidas(batalhas);
    }
    if (!batalhas.length) continue;
    novas += batalhas.length;
    if (existentes.length + 1 > MAXIMO_DE_PARTES) {
      // Junta tudo numa só parte, para o dia de hoje não acumular linhas.
      const todas = [...existentes.flatMap((parte) => desempacotar(parte.dados)), ...batalhas];
      await ligacao.transaction(async (tx) => {
        await tx.delete(observedBattlePacks).where(inArray(observedBattlePacks.id, existentes.map((parte) => parte.id)));
        for (const linha of emLinhas(todas)) await tx.insert(observedBattlePacks).values({ mapId: grupo.mapId, mode: grupo.mode, dia: grupo.dia, ...linha });
      });
    } else {
      for (const linha of emLinhas(batalhas)) await ligacao.insert(observedBattlePacks).values({ mapId: grupo.mapId, mode: grupo.mode, dia: grupo.dia, ...linha });
    }
  }
  return { novas, grupos: grupos.length };
}

/**
 * Junta as partes dos dias já fechados (e as deixadas pela migração) numa só
 * linha por mapa, modo e dia. Para quando o prazo ou o limite de grupos acabar.
 */
export async function compactarDiasFechados(hoje: string, limiteDeGrupos = 25, prazo = Number.POSITIVE_INFINITY) {
  const ligacao = await db();
  const grupos = await ligacao.select({ mapId: observedBattlePacks.mapId, mode: observedBattlePacks.mode, dia: observedBattlePacks.dia, partes: count() })
    .from(observedBattlePacks).where(lt(observedBattlePacks.dia, hoje))
    .groupBy(observedBattlePacks.mapId, observedBattlePacks.mode, observedBattlePacks.dia)
    .having(sql`count(*) > 1`).limit(limiteDeGrupos);
  let juntados = 0;
  for (const grupo of grupos) {
    if (Date.now() >= prazo) break;
    const partes = await partesDoGrupo(ligacao, grupo.mapId, grupo.mode, grupo.dia);
    if (partes.length < 2) continue;
    const todas = semRepetidas(partes.flatMap((parte) => desempacotar(parte.dados)));
    await ligacao.transaction(async (tx) => {
      await tx.delete(observedBattlePacks).where(inArray(observedBattlePacks.id, partes.map((parte) => parte.id)));
      for (const linha of emLinhas(todas)) await tx.insert(observedBattlePacks).values({ mapId: grupo.mapId, mode: grupo.mode, dia: grupo.dia, ...linha });
    });
    juntados += 1;
  }
  return { juntados, pendentes: grupos.length - juntados };
}

/** Apaga os pacotes de dias anteriores ao dia de corte (AAAA-MM-DD). */
export async function expirarPacotes(diaDeCorte: string) {
  const ligacao = await db();
  await ligacao.delete(observedBattlePacks).where(lt(observedBattlePacks.dia, diaDeCorte));
}

export type LinhaDePacote = { mapId: string; mode: string; dia: string; dados: string };

/** Percorre os pacotes de um período, poucas linhas de cada vez (cada uma pode ter ~1 MB). */
export async function percorrerPacotes(
  filtro: { desdeDia: string; mapId?: string; mode?: string },
  consumir: (linha: LinhaDePacote) => void,
) {
  const ligacao = await db();
  let cursor = 0;
  for (;;) {
    const linhas = await ligacao.select({
      id: observedBattlePacks.id, mapId: observedBattlePacks.mapId, mode: observedBattlePacks.mode, dia: observedBattlePacks.dia, dados: observedBattlePacks.dados,
    }).from(observedBattlePacks).where(and(
      gt(observedBattlePacks.id, cursor),
      gte(observedBattlePacks.dia, filtro.desdeDia),
      filtro.mapId ? eq(observedBattlePacks.mapId, filtro.mapId) : undefined,
      filtro.mode ? eq(observedBattlePacks.mode, filtro.mode) : undefined,
    )).orderBy(asc(observedBattlePacks.id)).limit(PAGINA_DE_PACOTES);
    for (const linha of linhas) consumir(linha);
    if (linhas.length < PAGINA_DE_PACOTES) return;
    cursor = linhas[linhas.length - 1].id;
  }
}

/** O modo de um mapa, lido do pacote mais recente dele. */
export async function modoDoMapa(mapId: string): Promise<string | null> {
  const ligacao = await db();
  const [linha] = await ligacao.select({ mode: observedBattlePacks.mode }).from(observedBattlePacks)
    .where(eq(observedBattlePacks.mapId, mapId)).orderBy(sql`${observedBattlePacks.dia} desc`).limit(1);
  return linha?.mode ?? null;
}

export async function contarPartidasEmPacotes() {
  const ligacao = await db();
  const [linha] = await ligacao.select({ total: sum(observedBattlePacks.partidas) }).from(observedBattlePacks);
  return Number(linha?.total ?? 0);
}

/** Partidas por mapa e modo, a partir da coluna `partidas` (para conferir a migração). */
export async function partidasPorMapaEmPacotes() {
  const ligacao = await db();
  const linhas = await ligacao.select({ mapId: observedBattlePacks.mapId, mode: observedBattlePacks.mode, total: sum(observedBattlePacks.partidas) })
    .from(observedBattlePacks).groupBy(observedBattlePacks.mapId, observedBattlePacks.mode);
  return linhas.map((l) => ({ mapId: l.mapId, mode: l.mode, partidas: Number(l.total ?? 0) }));
}

/* ---- resumos guardados ---- */

export async function lerResumoGuardado(chave: string) {
  const ligacao = await db();
  const [linha] = await ligacao.select({ geradoEm: observedSummaryCache.geradoEm, dados: observedSummaryCache.dados })
    .from(observedSummaryCache).where(eq(observedSummaryCache.chave, chave)).limit(1);
  return linha ?? null;
}

export async function guardarResumo(chave: string, dados: string) {
  const ligacao = await db();
  await ligacao.insert(observedSummaryCache).values({ chave, dados, geradoEm: new Date() })
    .onDuplicateKeyUpdate({ set: { dados, geradoEm: new Date() } });
}

/* ---- leitura do histórico antigo, para a migração ---- */

export async function maiorIdDasPartidasAntigas() {
  const ligacao = await db();
  const [linha] = await ligacao.select({ id: observedBattles.id }).from(observedBattles).orderBy(sql`${observedBattles.id} desc`).limit(1);
  return linha?.id ?? 0;
}

/** Um lote do histórico antigo em ordem de id, com rank e nível. */
export async function lerLoteDasPartidasAntigas(depoisDoId: number, ateAoId: number, limite: number) {
  const ligacao = await db();
  const ids = await ligacao.select({ id: observedBattles.id }).from(observedBattles)
    .where(and(gt(observedBattles.id, depoisDoId), lte(observedBattles.id, ateAoId))).orderBy(asc(observedBattles.id)).limit(limite);
  if (!ids.length) return { linhas: [] as Array<{ id: number; mapId: string; mode: string; battleTime: Date; winningTeam: string; losingTeam: string; rankMedio: number | null; todosNivel11: number | null }>, ultimoId: depoisDoId };
  const linhas = await ligacao.select({
    id: observedBattles.id, mapId: observedBattles.mapId, mode: observedBattles.mode, battleTime: observedBattles.battleTime,
    winningTeam: observedBattles.winningTeam, losingTeam: observedBattles.losingTeam,
    rankMedio: observedBattleRanks.rankMedio, todosNivel11: observedBattleQuality.todosNivel11,
  }).from(observedBattles)
    .leftJoin(observedBattleRanks, eq(observedBattleRanks.fingerprint, observedBattles.fingerprint))
    .leftJoin(observedBattleQuality, eq(observedBattleQuality.fingerprint, observedBattles.fingerprint))
    .where(inArray(observedBattles.id, ids.map((linha) => linha.id)))
    .orderBy(asc(observedBattles.id));
  if (linhas.length !== ids.length) throw new Error("Leitura incompleta das partidas a migrar.");
  return { linhas, ultimoId: ids[ids.length - 1].id };
}

/** Quantas partidas o histórico antigo tem desde um instante (para conferir a migração). */
export async function contarPartidasAntigasDesde(desde: Date) {
  const ligacao = await db();
  const [linha] = await ligacao.select({ total: count() }).from(observedBattles).where(gte(observedBattles.battleTime, desde));
  return Number(linha?.total ?? 0);
}
