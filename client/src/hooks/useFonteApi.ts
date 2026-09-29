import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApiOficial } from "@/hooks/useApiOficial";
import { definirFonteObservada, JOGOS_DE_PRIOR, montarFonteObservada } from "@shared/counterMatchupValue";

/**
 * O interruptor «Só API oficial» do Draft.
 *
 * Ligado, o Draft passa a ler apenas as partidas Ranked que o site recolhe da
 * API da Supercell, do mapa escolhido e do período escolhido (30 dias por
 * omissão; 24 h, 7, 14, tudo ou os dias que se escreverem):
 *  - a base de cada brawler (vitória e uso) sai dessas partidas, e não do
 *    Brawl Planet nem do TopBrawl;
 *  - os confrontos 1 contra 1 e as sinergias (e anti-sinergias) também, e não
 *    do BrawlScope, do PL Prodigy nem do Brawl Planet.
 * Desligado, tudo volta às fontes de sempre.
 *
 * Um mapa ainda sem partidas fica com toda a gente a 50% e sem bónus: é a
 * verdade de «não sabemos», e o aviso no ecrã diz quantas partidas há.
 */
function normalizarNome(nome: string | undefined) {
  return (nome ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type DadosDoMapaDaApi = {
  partidas: number;
  brawlers: ReadonlyArray<{ brawler: string; jogos: number; vitorias: number }>;
  confrontos: ReadonlyArray<{ a: string; b: string; jogos: number; vitorias: number }>;
  sinergias: ReadonlyArray<{ a: string; b: string; jogos: number; vitorias: number }>;
};

/** Um só objeto vazio: criado a cada desenho, o efeito abaixo correria sem parar. */
const SEM_PARTIDAS: DadosDoMapaDaApi = { partidas: 0, brawlers: [], confrontos: [], sinergias: [] };

export function useFonteApi(nomeDoMapa: string | undefined) {
  // O mesmo interruptor do site todo (Draft, Mapas, Matriz): ver `useApiOficial`.
  const { ligada, alternar, dias, setDias, rank, setRank } = useApiOficial();
  const doRank = rank || undefined;

  const lista = trpc.observedMatches.partidas.useQuery({ dias, rank: doRank }, { enabled: ligada, staleTime: 120_000, placeholderData: (anterior) => anterior });
  const mapa = lista.data?.mapas.find((entrada) => normalizarNome(entrada.nome) === normalizarNome(nomeDoMapa));
  const doMapa = trpc.observedMatches.partidas.useQuery(
    { dias, rank: doRank, mapId: mapa?.mapId },
    // Ao mudar o período, os números anteriores ficam até chegarem os novos — sem saltar para as outras fontes.
    { enabled: ligada && Boolean(mapa?.mapId), staleTime: 120_000, placeholderData: (anterior) => anterior },
  );
  const dados: DadosDoMapaDaApi | undefined = ligada
    ? mapa ? doMapa.data : lista.data ? SEM_PARTIDAS : undefined
    : undefined;

  const [versao, setVersao] = useState(0);
  useEffect(() => {
    definirFonteObservada(ligada ? montarFonteObservada(dados ?? SEM_PARTIDAS) : null);
    setVersao((v) => v + 1);
  }, [ligada, dados]);
  // Ao sair do Draft, as outras páginas voltam a ver as fontes de sempre.
  useEffect(() => () => definirFonteObservada(null), []);

  return {
    ligada,
    alternar,
    dados,
    dias,
    setDias,
    rank,
    setRank,
    aCarregar: ligada && (lista.isLoading || (Boolean(mapa?.mapId) && doMapa.isLoading)),
    /** Muda sempre que a fonte do motor muda — entra nas dependências do ranking. */
    versao,
    /** Todas as partidas do período (com a contagem de cada mapa), para a secção Mapas. */
    geral: ligada ? lista.data : undefined,
  };
}

/**
 * As linhas do mapa com a vitória e o uso das partidas recolhidas, e sem as
 * outras fontes. Para ORDENAR, a vitória é puxada para 50% com poucos jogos
 * (os mesmos `JOGOS_DE_PRIOR` jogos imaginários dos confrontos): três jogos a
 * 100% não passam à frente de trezentos a 60%. Para MOSTRAR, fica também a
 * vitória medida (`vitoriaNaApi`) e os jogos (`jogosNaApi`), que batem com a
 * página «Partidas». O uso é a percentagem de partidas em que o brawler
 * apareceu.
 */
export function linhasDaApi<T extends { brawler: string }>(linhas: readonly T[], dados: DadosDoMapaDaApi): T[] {
  const porNome = new Map(dados.brawlers.map((linha) => [normalizarNome(linha.brawler), linha]));
  return linhas.map((linha) => {
    const contagem = porNome.get(normalizarNome(linha.brawler));
    const jogos = contagem?.jogos ?? 0;
    const vitorias = contagem?.vitorias ?? 0;
    return {
      ...linha,
      winRate: ((vitorias + JOGOS_DE_PRIOR * 0.5) / (jogos + JOGOS_DE_PRIOR)) * 100,
      /** A vitória medida, sem o ajuste: é a que o ecrã mostra (a mesma da página «Partidas»). */
      vitoriaNaApi: jogos > 0 ? (vitorias / jogos) * 100 : null,
      usage: dados.partidas > 0 ? (jogos / dados.partidas) * 100 : 0,
      topBrawlWinRate: null,
      topBrawlUseRate: null,
      topBrawlScore: null,
      brawlPlanetWinRate: null,
      brawlPlanetPickRate: null,
      brawlPlanetStarPlayer: null,
      brawlPlanetPorElo: undefined,
      jogosNaApi: jogos,
    };
  });
}

export type PartidasDeTodosOsMapas = {
  mapas: ReadonlyArray<{ mapId: string; nome: string; partidas: number }>;
  brawlersPorMapa: Readonly<Record<string, ReadonlyArray<{ brawler: string; jogos: number; vitorias: number }>>>;
};

/**
 * `linhasDaApi` para todos os mapas de uma vez (a secção Mapas da página
 * inicial): cada mapa recebe as partidas dele. Um mapa sem partidas fica com
 * toda a gente a 50% e uso 0 — «não sabemos», como no Draft.
 */
export function linhasDosMapasDaApi<T extends { brawler: string; map: string }>(linhas: readonly T[], geral: PartidasDeTodosOsMapas): T[] {
  const porNome = new Map(geral.mapas.map((mapa) => [normalizarNome(mapa.nome), mapa]));
  const porMapa = new Map<string, T[]>();
  for (const linha of linhas) {
    const doMapa = porMapa.get(linha.map);
    if (doMapa) doMapa.push(linha);
    else porMapa.set(linha.map, [linha]);
  }
  return Array.from(porMapa, ([nome, doMapa]) => {
    const mapa = porNome.get(normalizarNome(nome));
    const brawlers = mapa ? geral.brawlersPorMapa[mapa.mapId] ?? [] : [];
    return linhasDaApi(doMapa, { partidas: mapa?.partidas ?? 0, brawlers, confrontos: [], sinergias: [] });
  }).flat();
}
