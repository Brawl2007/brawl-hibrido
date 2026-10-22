import { RANKED_MAP_SOURCES } from "@shared/rankedMaps";
import { nomeDoModo, criarResumoDasPartidas } from "@shared/partidasObservadas";
import { percorrerPartidasParaResumo, listObservedMapsParaResumo } from "./db";
import { lerNomesDosMapas } from "./observedMatchCollection";
import { intervaloDoRank } from "@shared/ranksDoRanked";
import { fichaDoBrawler } from "@shared/fichaDaApi";

export const DIAS_DE_RETENCAO = 30;
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
  const dias = filtro.dias && filtro.dias > 0 ? Math.min(filtro.dias, DIAS_DE_RETENCAO) : DIAS_DE_RETENCAO;
  const desde = new Date(Date.now() - dias * 86_400_000);
  const rank = intervaloDoRank(filtro.rank);
  const intervalo = rank ? { min: rank.min, max: rank.max } : undefined;
  const acumulador = criarResumoDasPartidas();
  const [_, porMapa, nomesGuardados] = await Promise.all([
    percorrerPartidasParaResumo({ desde, mode: filtro.mode, mapId: filtro.mapId, rank: intervalo }, (linhas) => {
      acumulador.acrescentar(linhas.map(linha => ({ mapId: linha.mapId, mode: linha.mode,
        vencedores: lerEquipa(linha.winningTeam), derrotados: lerEquipa(linha.losingTeam) })));
    }),
    listObservedMapsParaResumo(desde, intervalo),
    lerNomesDosMapas(),
  ]);
  const nomeDoMapa = (mapId: string) =>
    nomesGuardados[mapId] ?? RANKED_MAP_SOURCES.find(([, id]) => id === mapId)?.[0] ?? `Mapa ${mapId}`;
  const resumo = acumulador.terminar();
  const modos = new Map<string, number>();
  for (const linha of porMapa) modos.set(linha.mode, (modos.get(linha.mode) ?? 0) + Number(linha.partidas));
  return {
    geradoEm: new Date().toISOString(),
    dias,
    filtro: { mode: filtro.mode ?? null, mapId: filtro.mapId ?? null, rank: rank?.id ?? null },
    limiteAtingido: false,
    modos: Array.from(modos, ([mode, partidas]) => ({ mode, nome: nomeDoModo(mode), partidas })).sort((a, b) => b.partidas - a.partidas),
    mapas: porMapa
      .map((linha) => ({ mapId: linha.mapId, nome: nomeDoMapa(linha.mapId), mode: linha.mode, modoNome: nomeDoModo(linha.mode), partidas: Number(linha.partidas) }))
      .sort((a, b) => b.partidas - a.partidas),
    ...resumo,
  };
}

export type ResumoDaPagina = Awaited<ReturnType<typeof calcular>>;

/**
 * Guardado três minutos por filtro: a recolha muda a cada 15 minutos, e a
 * página pede o mesmo resumo a cada troca de separador.
 */
const guardados = new Map<string, { em: number; valor: ResumoDaPagina }>();

const emCurso = new Map<string, Promise<ResumoDaPagina>>();

export async function resumoDasPartidas(filtro: FiltroDasPartidas): Promise<ResumoDaPagina> {
  const dias = filtro.dias && filtro.dias > 0 ? Math.min(filtro.dias, DIAS_DE_RETENCAO) : DIAS_DE_RETENCAO;
  const chave = JSON.stringify([dias, filtro.mode ?? "", filtro.mapId ?? "", filtro.rank ?? ""]);
  const guardado = guardados.get(chave);
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.valor;
  const pendente = emCurso.get(chave);
  if (pendente) return pendente;
  const calculo = calcular(filtro);
  emCurso.set(chave, calculo);
  let valor: ResumoDaPagina;
  try { valor = await calculo; } finally { emCurso.delete(chave); }
  guardados.set(chave, { em: Date.now(), valor });
  if (guardados.size > 4) guardados.delete(guardados.keys().next().value as string);
  return valor;
}

/**
 * A ficha de um brawler para a Matriz 1v1 (botão «API»): só as linhas dele,
 * para o telemóvel não descarregar o resumo inteiro. Usa os mesmos resumos
 * guardados que a página «Partidas».
 */
export async function fichaDaMatriz(filtro: FiltroDasPartidas & { brawler: string }) {
  const [resumo, geral] = await Promise.all([
    resumoDasPartidas(filtro),
    resumoDasPartidas({ dias: filtro.dias, rank: filtro.rank }),
  ]);
  return {
    geradoEm: resumo.geradoEm,
    dias: resumo.dias,
    filtro: resumo.filtro,
    limiteAtingido: resumo.limiteAtingido,
    modos: geral.modos,
    mapas: geral.mapas,
    brawlers: resumo.brawlers.map((linha) => ({ brawler: linha.brawler, jogos: linha.jogos })),
    ficha: fichaDoBrawler(resumo, filtro.brawler, geral.brawlersPorModo),
  };
}

export type FichaDaMatriz = Awaited<ReturnType<typeof fichaDaMatriz>>;

