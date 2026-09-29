import { RANKED_MAP_SOURCES } from "@shared/rankedMaps";
import { nomeDoModo, resumirPartidas } from "@shared/partidasObservadas";
import { listObservedBattlesParaResumo, listObservedMapsParaResumo } from "./db";
import { lerNomesDosMapas } from "./observedMatchCollection";
import { intervaloDoRank } from "@shared/ranksDoRanked";

/** Uma rede de segurança para a memória da função; a página diz se for atingida. */
const LIMITE_DE_PARTIDAS = 60_000;
const VALIDADE_MS = 180_000;

export type FiltroDasPartidas = { dias?: number; mode?: string; mapId?: string; rank?: string };

function lerEquipa(texto: string) {
  try {
    const lista = JSON.parse(texto);
    return Array.isArray(lista) ? lista.filter((nome): nome is string => typeof nome === "string") : [];
  } catch {
    return [];
  }
}

async function calcular(filtro: FiltroDasPartidas) {
  const dias = filtro.dias ?? 30;
  const desde = dias > 0 ? new Date(Date.now() - dias * 86_400_000) : undefined;
  const rank = intervaloDoRank(filtro.rank);
  const intervalo = rank ? { min: rank.min, max: rank.max } : undefined;
  const [linhas, porMapa, nomesGuardados] = await Promise.all([
    listObservedBattlesParaResumo({ desde, mode: filtro.mode, mapId: filtro.mapId, rank: intervalo, limite: LIMITE_DE_PARTIDAS }),
    listObservedMapsParaResumo(desde, intervalo),
    lerNomesDosMapas(),
  ]);
  const nomeDoMapa = (mapId: string) =>
    nomesGuardados[mapId] ?? RANKED_MAP_SOURCES.find(([, id]) => id === mapId)?.[0] ?? `Mapa ${mapId}`;
  const resumo = resumirPartidas(linhas.map((linha) => ({
    mapId: linha.mapId,
    mode: linha.mode,
    vencedores: lerEquipa(linha.winningTeam),
    derrotados: lerEquipa(linha.losingTeam),
  })));
  const modos = new Map<string, number>();
  for (const linha of porMapa) modos.set(linha.mode, (modos.get(linha.mode) ?? 0) + Number(linha.partidas));
  return {
    geradoEm: new Date().toISOString(),
    dias,
    filtro: { mode: filtro.mode ?? null, mapId: filtro.mapId ?? null, rank: rank?.id ?? null },
    limiteAtingido: linhas.length >= LIMITE_DE_PARTIDAS,
    modos: Array.from(modos, ([mode, partidas]) => ({ mode, nome: nomeDoModo(mode), partidas })).sort((a, b) => b.partidas - a.partidas),
    mapas: porMapa
      .map((linha) => ({ mapId: linha.mapId, nome: nomeDoMapa(linha.mapId), mode: linha.mode, modoNome: nomeDoModo(linha.mode), partidas: Number(linha.partidas) }))
      .sort((a, b) => b.partidas - a.partidas),
    ...resumo,
  };
}

export type ResumoDaPagina = Awaited<ReturnType<typeof calcular>>;

/**
 * Guardado três minutos por filtro: a recolha só muda de hora a hora, e a
 * página pede o mesmo resumo a cada troca de separador.
 */
const guardados = new Map<string, { em: number; valor: ResumoDaPagina }>();

export async function resumoDasPartidas(filtro: FiltroDasPartidas): Promise<ResumoDaPagina> {
  const chave = JSON.stringify([filtro.dias ?? 30, filtro.mode ?? "", filtro.mapId ?? "", filtro.rank ?? ""]);
  const guardado = guardados.get(chave);
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.valor;
  const valor = await calcular(filtro);
  guardados.set(chave, { em: Date.now(), valor });
  if (guardados.size > 200) guardados.delete(guardados.keys().next().value as string);
  return valor;
}
