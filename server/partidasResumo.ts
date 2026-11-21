import { resumirPartidasDeExemplo, usarPartidasDeExemplo } from "./partidasDeExemplo";
import { criarReferenciasDoMapa } from "@shared/adequacaoAoMapa";
import { perfisTaticosDoDraft } from "@shared/draft";
import { getPublicRankedSnapshot } from "./rankedSync";
import { obterTerreno } from "./terrenoDoMapa";
import { RANKED_MAP_SOURCES } from "@shared/rankedMaps";
import { nomeDoModo, criarResumoDasPartidas } from "@shared/partidasObservadas";
import { percorrerPartidasParaResumo, listObservedMapsParaResumo } from "./db";
import { lerNomesDosMapas } from "./observedMatchCollection";
import { intervaloDoRank } from "@shared/ranksDoRanked";
import { fichaDoBrawler } from "@shared/fichaDaApi";
import { desempacotar, diaDaBatalha, eloDoNivel, type BatalhaCompacta } from "@shared/partidasCompactas";
import type { PartidaObservada } from "@shared/partidasObservadas";
import { waitUntil } from "@vercel/functions";
import { lerArmazenamento } from "./migracaoCompacta";
import { guardarResumo, lerResumoGuardado, modoDoMapa, percorrerPacotes } from "./pacotesDePartidas";

export const DIAS_DE_RETENCAO = 30;

export type FiltroDasPartidas = { dias?: number; mode?: string; mapId?: string; rank?: string };

function lerEquipa(texto: string) {
  try {
    const lista = JSON.parse(texto);
    return Array.isArray(lista) ? lista.filter((nome): nome is string => typeof nome === "string") : [];
  } catch {
    return [];
  }
}

/** De onde vêm os números: o histórico antigo (até a migração acabar) ou os pacotes compactos. */
let origemEmMemoria: { em: number; valor: "antigo" | "pacotes" } | null = null;
async function origemDosDados() {
  if (origemEmMemoria && Date.now() - origemEmMemoria.em < 30_000) return origemEmMemoria.valor;
  let valor: "antigo" | "pacotes" = "antigo";
  // Só leitura: se o estado não se conseguir ler, o histórico antigo continua completo.
  try { valor = (await lerArmazenamento()) === "compacto" ? "pacotes" : "antigo"; } catch { /* mantém o antigo */ }
  origemEmMemoria = { em: Date.now(), valor };
  return valor;
}

function parametrosDoFiltro(filtro: { dias?: number; rank?: string }) {
  const dias = filtro.dias && filtro.dias > 0 ? Math.min(filtro.dias, DIAS_DE_RETENCAO) : DIAS_DE_RETENCAO;
  const rank = intervaloDoRank(filtro.rank);
  return { dias, desde: new Date(Date.now() - dias * 86_400_000), rank, intervalo: rank ? { min: rank.min, max: rank.max } : undefined };
}

/** Lê os pacotes do período e entrega as partidas que passam nos filtros, pacote a pacote. */
async function lerBatalhasDosPacotes(
  filtro: { desde: Date; mapId?: string; mode?: string; intervalo?: { min: number; max: number } },
  consumir: (linha: { mapId: string; mode: string }, batalhas: BatalhaCompacta[]) => void,
) {
  const desdeSegundos = filtro.desde.getTime() / 1000;
  await percorrerPacotes({ desdeDia: diaDaBatalha(Math.floor(desdeSegundos)), mapId: filtro.mapId, mode: filtro.mode }, (linha) => {
    const validas = desempacotar(linha.dados).filter((b) => b.t >= desdeSegundos
      && (!filtro.intervalo || (b.rank >= filtro.intervalo.min && b.rank <= filtro.intervalo.max)));
    if (validas.length) consumir(linha, validas);
  });
}

const paraObservada = (linha: { mapId: string; mode: string }, b: BatalhaCompacta): PartidaObservada => ({
  mapId: linha.mapId, mode: linha.mode, vencedores: b.vencedores, derrotados: b.derrotados,
  battleTimeIso: new Date(b.t * 1000).toISOString(), todosNivel11: b.nivel11, eloMedioRank: eloDoNivel(b.rank),
});

type ContagemDoMapa = { mapId: string; mode: string; partidas: number };
function contagens() {
  const porChave = new Map<string, ContagemDoMapa>();
  return {
    somar(linha: { mapId: string; mode: string }, n: number) {
      const chave = `${linha.mapId}\u0000${linha.mode}`;
      const atual = porChave.get(chave);
      if (atual) atual.partidas += n; else porChave.set(chave, { mapId: linha.mapId, mode: linha.mode, partidas: n });
    },
    lista: () => [...porChave.values()],
  };
}

async function contagemDosMapasEmPacotes(desde: Date, intervalo?: { min: number; max: number }) {
  const total = contagens();
  await lerBatalhasDosPacotes({ desde, intervalo }, (linha, batalhas) => total.somar(linha, batalhas.length));
  return total.lista();
}

async function calcularDosPacotes(filtro: FiltroDasPartidas) {
  const { dias, desde, rank, intervalo } = parametrosDoFiltro(filtro);
  const acumulador = criarResumoDasPartidas({ ponderar: true });
  const filtrado = Boolean(filtro.mapId || filtro.mode);
  const total = contagens();
  const [, nomesGuardados] = await Promise.all([
    lerBatalhasDosPacotes({ desde, mapId: filtro.mapId, mode: filtro.mode, intervalo }, (linha, batalhas) => {
      acumulador.acrescentar(batalhas.map((b) => paraObservada(linha, b)));
      if (!filtrado) total.somar(linha, batalhas.length);
    }),
    lerNomesDosMapas(),
  ]);
  // A lista de mapas e de modos não encolhe com o filtro: serve para o escolher.
  const porMapa = filtrado ? await contagemDosMapasEmPacotes(desde, intervalo) : total.lista();
  return montarResumoDaPagina({ filtro, dias, rank: rank?.id ?? null, porMapa, nomesGuardados, resumo: acumulador.terminar() });
}

type ResumoTerminado = ReturnType<ReturnType<typeof criarResumoDasPartidas>["terminar"]>;
function montarResumoDaPagina(p: { filtro: FiltroDasPartidas; dias: number; rank: string | null; porMapa: ReadonlyArray<{ mapId: string; mode: string; partidas: number }>; nomesGuardados: Record<string, string>; resumo: ResumoTerminado; exemplo?: boolean }) {
  const nomeDoMapa = (mapId: string) =>
    p.nomesGuardados[mapId] ?? RANKED_MAP_SOURCES.find(([, id]) => id === mapId)?.[0] ?? `Mapa ${mapId}`;
  const modos = new Map<string, number>();
  for (const linha of p.porMapa) modos.set(linha.mode, (modos.get(linha.mode) ?? 0) + Number(linha.partidas));
  return {
    geradoEm: new Date().toISOString(),
    dias: p.dias,
    filtro: { mode: p.filtro.mode ?? null, mapId: p.filtro.mapId ?? null, rank: p.rank },
    limiteAtingido: false,
    /** As partidas de teste do desenvolvimento (`partidasDeExemplo.ts`), nunca em produção. */
    exemplo: p.exemplo ?? false,
    modos: Array.from(modos, ([mode, partidas]) => ({ mode, nome: nomeDoModo(mode), partidas })).sort((a, b) => b.partidas - a.partidas),
    mapas: p.porMapa
      .map((linha) => ({ mapId: linha.mapId, nome: nomeDoMapa(linha.mapId), mode: linha.mode, modoNome: nomeDoModo(linha.mode), partidas: Number(linha.partidas) }))
      .sort((a, b) => b.partidas - a.partidas),
    ...p.resumo,
  };
}

async function calcular(filtro: FiltroDasPartidas) {
  if ((await origemDosDados()) === "pacotes") return calcularDosPacotes(filtro);
  return calcularDoHistoricoAntigo(filtro);
}

async function calcularDoHistoricoAntigo(filtro: FiltroDasPartidas) {
  const dias = filtro.dias && filtro.dias > 0 ? Math.min(filtro.dias, DIAS_DE_RETENCAO) : DIAS_DE_RETENCAO;
  const desde = new Date(Date.now() - dias * 86_400_000);
  const rank = intervaloDoRank(filtro.rank);
  const intervalo = rank ? { min: rank.min, max: rank.max } : undefined;
  const acumulador = criarResumoDasPartidas({ ponderar: true });
  const [_, porMapa, nomesGuardados] = await Promise.all([
    percorrerPartidasParaResumo({ desde, mode: filtro.mode, mapId: filtro.mapId, rank: intervalo }, (linhas) => {
      acumulador.acrescentar(linhas.map(linha => ({ mapId: linha.mapId, mode: linha.mode,
        vencedores: lerEquipa(linha.winningTeam), derrotados: lerEquipa(linha.losingTeam),
        battleTimeIso: linha.battleTime?.toISOString(), todosNivel11: linha.todosNivel11 === 1,
        eloMedioRank: eloDoNivel(linha.rankMedio) })));
    }),
    listObservedMapsParaResumo(desde, intervalo),
    lerNomesDosMapas(),
  ]);
  return montarResumoDaPagina({ filtro, dias, rank: rank?.id ?? null, porMapa, nomesGuardados, resumo: acumulador.terminar() });
}

export type ResumoDaPagina = Awaited<ReturnType<typeof calcular>>;

/**
 * Resumos guardados, em memória e na base (v182).
 *
 * Os números só mudam a cada volta da recolha (15 minutos), mas calculá-los
 * custa segundos. Quem pede recebe o último resumo de imediato, mesmo que já
 * tenha passado a validade: o recálculo corre em segundo plano e o pedido
 * seguinte já o vê. O da base serve a primeira abertura de uma instância fria.
 */
const VALIDADE_MS = 600_000;
const ATRASO_MAXIMO_MS = 12 * 3_600_000;
const TAMANHO_MAXIMO_NA_BASE = 4_000_000;
const emMemoria = new Map<string, { em: number; valor: unknown }>();
const emCurso = new Map<string, Promise<unknown>>();

function emSegundoPlano(trabalho: Promise<unknown>) {
  trabalho.catch((erro: unknown) => console.warn("[Partidas] Resumo não recalculado:", erro instanceof Error ? erro.message : erro));
  try { waitUntil(trabalho); } catch { /* fora da Vercel o trabalho corre na mesma */ }
}

async function comResumoGuardado<T>(chave: string, calcularResumo: () => Promise<T>): Promise<T> {
  const recalcular = () => {
    const pendente = emCurso.get(chave) as Promise<T> | undefined;
    if (pendente) return pendente;
    const trabalho = calcularResumo().then(async (valor) => {
      emMemoria.set(chave, { em: Date.now(), valor });
      if (emMemoria.size > 24) emMemoria.delete(emMemoria.keys().next().value as string);
      const texto = JSON.stringify(valor);
      if (texto.length < TAMANHO_MAXIMO_NA_BASE) await guardarResumo(chave, texto).catch(() => undefined);
      return valor;
    }).finally(() => emCurso.delete(chave));
    emCurso.set(chave, trabalho);
    return trabalho;
  };
  const agora = Date.now();
  const memorizado = emMemoria.get(chave) as { em: number; valor: T } | undefined;
  if (memorizado && agora - memorizado.em < ATRASO_MAXIMO_MS) {
    if (agora - memorizado.em >= VALIDADE_MS) emSegundoPlano(recalcular());
    return memorizado.valor;
  }
  const guardado = await lerResumoGuardado(chave).catch(() => null);
  if (guardado) {
    const geradoEm = new Date(guardado.geradoEm).getTime();
    if (agora - geradoEm < ATRASO_MAXIMO_MS) {
      try {
        const valor = JSON.parse(guardado.dados) as T;
        emMemoria.set(chave, { em: geradoEm, valor });
        if (agora - geradoEm >= VALIDADE_MS) emSegundoPlano(recalcular());
        return valor;
      } catch { /* resumo ilegível: recalcula-se */ }
    }
  }
  return recalcular();
}

export async function resumoDasPartidas(filtro: FiltroDasPartidas): Promise<ResumoDaPagina> {
  if (usarPartidasDeExemplo()) {
    const { dias } = parametrosDoFiltro(filtro);
    return montarResumoDaPagina({ filtro, dias, rank: null, exemplo: true, ...resumirPartidasDeExemplo(filtro) });
  }
  const { dias } = parametrosDoFiltro(filtro);
  return comResumoGuardado(`resumo:${JSON.stringify([dias, filtro.mode ?? "", filtro.mapId ?? "", filtro.rank ?? ""])}`, () => calcular(filtro));
}

const arredondar = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 1000) / 1000);
function leve<T extends { jogosPonderados?: number; vitoriasPonderadas?: number }>(lista: readonly T[]): T[] {
  return lista.map((linha) => ({ ...linha, jogosPonderados: arredondar(linha.jogosPonderados), vitoriasPonderadas: arredondar(linha.vitoriasPonderadas) }));
}

/** O que o Draft com a API precisa de um mapa: o mapa em si e, de apoio, o modo dele. */
export type ResumoDoDraft = {
  geradoEm: string;
  dias: number;
  mapId: string;
  modeId?: string;
  partidas: number;
  partidasPonderadas: number;
  brawlers: ResumoTerminado["brawlers"];
  confrontos: ResumoTerminado["confrontos"];
  sinergias: ResumoTerminado["sinergias"];
  equipas: ResumoTerminado["equipas"];
  priorModo: { brawlers: ResumoTerminado["brawlers"]; confrontos: ResumoTerminado["confrontos"]; sinergias: ResumoTerminado["sinergias"]; equipas: ResumoTerminado["equipas"] };
};

/** Trios com menos de 3 jogos pesam menos de 7% (K=40): não vale a pena enviá-los. */
const JOGOS_MINIMOS_DO_TRIO = 3;
function fatiaParaODraft(r: Pick<ResumoTerminado, "brawlers" | "confrontos" | "sinergias" | "equipas">) {
  return { brawlers: leve(r.brawlers), confrontos: leve(r.confrontos), sinergias: leve(r.sinergias), equipas: leve(r.equipas.filter((e) => e.jogos >= JOGOS_MINIMOS_DO_TRIO)) };
}

async function draftDosPacotes(mapId: string, filtro: { dias?: number; rank?: string }): Promise<ResumoDoDraft> {
  const { dias, desde, intervalo } = parametrosDoFiltro(filtro);
  const modo = await modoDoMapa(mapId);
  const vazio = fatiaParaODraft({ brawlers: [], confrontos: [], sinergias: [], equipas: [] });
  if (!modo) return { geradoEm: new Date().toISOString(), dias, mapId, partidas: 0, partidasPonderadas: 0, ...vazio, priorModo: vazio };
  const doMapa = criarResumoDasPartidas({ ponderar: true, escopo: "unico" });
  const doModo = criarResumoDasPartidas({ ponderar: true, escopo: "unico" });
  await lerBatalhasDosPacotes({ desde, mode: modo, intervalo }, (linha, batalhas) => {
    const observadas = batalhas.map((b) => paraObservada(linha, b));
    doModo.acrescentar(observadas);
    if (linha.mapId === mapId) doMapa.acrescentar(observadas);
  });
  const m = doMapa.terminar(), g = doModo.terminar();
  return { geradoEm: new Date().toISOString(), dias, mapId, modeId: modo, partidas: m.partidas, partidasPonderadas: m.partidasPonderadas ?? 0, ...fatiaParaODraft(m), priorModo: fatiaParaODraft(g) };
}

async function draftDoHistoricoAntigo(mapId: string, filtro: { dias?: number; rank?: string }): Promise<ResumoDoDraft> {
  const [doMapa, geral] = await Promise.all([resumoDasPartidas({ ...filtro, mapId }), resumoDasPartidas({ dias: filtro.dias, rank: filtro.rank })]);
  const modo = geral.mapas.find((m) => m.mapId === mapId)?.mode;
  return {
    geradoEm: doMapa.geradoEm, dias: doMapa.dias, mapId, modeId: modo,
    partidas: doMapa.partidas, partidasPonderadas: doMapa.partidasPonderadas ?? 0, ...fatiaParaODraft(doMapa),
    priorModo: fatiaParaODraft({
      brawlers: modo ? geral.brawlersPorModo[modo] ?? [] : [], confrontos: modo ? geral.confrontosPorModo?.[modo] ?? [] : [],
      sinergias: modo ? geral.sinergiasPorModo?.[modo] ?? [] : [], equipas: modo ? geral.equipasPorModo?.[modo] ?? [] : [],
    }),
  };
}

/** O resumo que o Draft com «API oficial» usa: um mapa, o modo dele, o período e o rank. */
export function resumoParaODraft(filtro: { mapId: string; dias?: number; rank?: string }): Promise<ResumoDoDraft> {
  const { dias } = parametrosDoFiltro(filtro);
  return comResumoGuardado(`draft:${JSON.stringify([dias, filtro.rank ?? "", filtro.mapId])}`, async () =>
    (await origemDosDados()) === "pacotes" ? draftDosPacotes(filtro.mapId, filtro) : draftDoHistoricoAntigo(filtro.mapId, filtro));
}

/** Contagens por brawler, por mapa e por modo de todos os mapas (a secção Mapas e a escolha do mapa no Draft). */
async function mapasDosPacotes(filtro: { dias?: number; rank?: string }) {
  const { dias, desde, rank, intervalo } = parametrosDoFiltro(filtro);
  const acumulador = criarResumoDasPartidas({ ponderar: true, escopo: "brawlers" });
  const total = contagens();
  const [, nomesGuardados] = await Promise.all([
    lerBatalhasDosPacotes({ desde, intervalo }, (linha, batalhas) => {
      acumulador.acrescentar(batalhas.map((b) => paraObservada(linha, b)));
      total.somar(linha, batalhas.length);
    }),
    lerNomesDosMapas(),
  ]);
  const r = montarResumoDaPagina({ filtro: {}, dias, rank: rank?.id ?? null, porMapa: total.lista(), nomesGuardados, resumo: acumulador.terminar() });
  return { geradoEm: r.geradoEm, dias: r.dias, mapas: r.mapas, modos: r.modos, partidas: r.partidas, brawlersPorMapa: r.brawlersPorMapa, brawlersPorModo: r.brawlersPorModo, partidasPonderadasPorMapa: r.partidasPonderadasPorMapa ?? {} };
}

export type ResumoDosMapas = Awaited<ReturnType<typeof mapasDosPacotes>>;

export function resumoDosMapas(filtro: { dias?: number; rank?: string }): Promise<ResumoDosMapas> {
  const { dias } = parametrosDoFiltro(filtro);
  return comResumoGuardado(`mapas:${JSON.stringify([dias, filtro.rank ?? ""])}`, async () => {
    if ((await origemDosDados()) === "pacotes") return mapasDosPacotes(filtro);
    const r = await resumoDasPartidas({ dias: filtro.dias, rank: filtro.rank });
    return { geradoEm: r.geradoEm, dias: r.dias, mapas: r.mapas, modos: r.modos, partidas: r.partidas, brawlersPorMapa: r.brawlersPorMapa, brawlersPorModo: r.brawlersPorModo, partidasPonderadasPorMapa: r.partidasPonderadasPorMapa ?? {} };
  });
}

/** O confronto de dois brawlers num mapa, para o aviso do Draft (substitui os agregados antigos depois da migração). */
export async function confrontoNoMapa(mapId: string, brawler: string, oponente: string) {
  if ((await origemDosDados()) !== "pacotes") return null;
  const resumo = await resumoParaODraft({ mapId });
  const igual = (a: string, b: string) => a.toLocaleUpperCase("en") === b.toLocaleUpperCase("en");
  const linha = resumo.confrontos.find((c) => igual(c.a, brawler) && igual(c.b, oponente));
  return { samples: linha?.jogos ?? 0, wins: linha?.vitorias ?? 0 };
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
  const modo = filtro.mode ?? geral.mapas.find((m) => m.mapId === filtro.mapId)?.mode;
  const nomeMapa = geral.mapas.find(m => m.mapId === filtro.mapId)?.nome ?? RANKED_MAP_SOURCES.find(([,id]) => id === filtro.mapId)?.[0];
  const [snapshot, terreno] = filtro.mapId ? await Promise.all([getPublicRankedSnapshot(), obterTerreno(filtro.mapId)]) : [null, null];
  const rows = nomeMapa ? (snapshot?.payload.rows ?? []).filter(r => r.map === nomeMapa) : [];
  const referenciasMapa = criarReferenciasDoMapa(rows, perfisTaticosDoDraft(rows.map(r => r.brawler)), nomeMapa, terreno);
  const priorModo = modo ? { brawlers: geral.brawlersPorModo[modo] ?? [], confrontos: geral.confrontosPorModo?.[modo] ?? [], sinergias: geral.sinergiasPorModo?.[modo] ?? [], equipas: geral.equipasPorModo?.[modo] ?? [] } : undefined;
  return {
    geradoEm: resumo.geradoEm,
    dias: resumo.dias,
    filtro: resumo.filtro,
    limiteAtingido: resumo.limiteAtingido,
    modos: geral.modos,
    mapas: geral.mapas,
    brawlers: resumo.brawlers.map((linha) => ({ brawler: linha.brawler, jogos: linha.jogos })),
    ficha: fichaDoBrawler(resumo, filtro.brawler, geral.brawlersPorModo, priorModo, modo, referenciasMapa),
  };
}

export type FichaDaMatriz = Awaited<ReturnType<typeof fichaDaMatriz>>;

