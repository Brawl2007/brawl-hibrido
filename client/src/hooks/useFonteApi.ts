import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
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
const CHAVE = "draft-so-api-oficial";
const CHAVE_DOS_DIAS = "draft-so-api-oficial-dias";

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
  const [ligada, setLigada] = useState(() => {
    try {
      return localStorage.getItem(CHAVE) === "1";
    } catch {
      return false;
    }
  });
  const [dias, setDiasGuardados] = useState(() => {
    try {
      const guardado = Number(localStorage.getItem(CHAVE_DOS_DIAS));
      return Number.isInteger(guardado) && guardado >= 0 && guardado <= 3650 && localStorage.getItem(CHAVE_DOS_DIAS) !== null ? guardado : 30;
    } catch {
      return 30;
    }
  });
  const setDias = useCallback((novos: number) => {
    setDiasGuardados(novos);
    try {
      localStorage.setItem(CHAVE_DOS_DIAS, String(novos));
    } catch {
      // Sem armazenamento: vale só nesta visita.
    }
  }, []);
  const alternar = useCallback(() => {
    setLigada((atual) => {
      const nova = !atual;
      try {
        localStorage.setItem(CHAVE, nova ? "1" : "0");
      } catch {
        // Sem armazenamento: fica ligado só nesta visita.
      }
      return nova;
    });
  }, []);

  const lista = trpc.observedMatches.partidas.useQuery({ dias }, { enabled: ligada, staleTime: 120_000, placeholderData: (anterior) => anterior });
  const mapa = lista.data?.mapas.find((entrada) => normalizarNome(entrada.nome) === normalizarNome(nomeDoMapa));
  const doMapa = trpc.observedMatches.partidas.useQuery(
    { dias, mapId: mapa?.mapId },
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
    aCarregar: ligada && (lista.isLoading || (Boolean(mapa?.mapId) && doMapa.isLoading)),
    /** Muda sempre que a fonte do motor muda — entra nas dependências do ranking. */
    versao,
  };
}

/**
 * As linhas do mapa com a vitória e o uso das partidas recolhidas, e sem as
 * outras fontes. A vitória é puxada para 50% com poucos jogos (os mesmos
 * `JOGOS_DE_PRIOR` jogos imaginários dos confrontos); o uso é a percentagem de
 * partidas em que o brawler apareceu.
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
