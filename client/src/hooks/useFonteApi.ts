import { criarReferenciasDoMapa } from "@shared/adequacaoAoMapa";
import { perfisTaticosDoDraft } from "@shared/draft";
import type { UsageWinMetricRow } from "@shared/hybridScore";
import { montarDadosDoMotorApi, type DadosApiParaMotor } from "@shared/observedMatchupMatrix";
import { calcularWinRateBayesiano } from "@shared/amostraPequena";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApiOficial } from "@/hooks/useApiOficial";
import { definirFonteObservada, montarFonteObservada } from "@shared/counterMatchupValue";

/**
 * A base de mapas e brawlers vem das partidas oficiais, no mapa, período e rank
 * escolhidos. Confrontos escassos usam as matrizes do projeto como prior; a
 * contribuição dessas matrizes diminui à medida que a API acumula evidência.
 */
function normalizarNome(nome: string | undefined) {
  return (nome ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type DadosDoMapaDaApi = DadosApiParaMotor & { modeId?: string };

/** Um só objeto vazio: criado a cada desenho, o efeito abaixo correria sem parar. */
const SEM_PARTIDAS: DadosDoMapaDaApi = { partidas: 0, partidasPonderadas: 0, brawlers: [], confrontos: [], sinergias: [] };

const SEM_REFERENCIAS: readonly (UsageWinMetricRow & { brawler: string })[] = [];
export function useFonteApi(nomeDoMapa: string | undefined, linhasOriginais: readonly (UsageWinMetricRow & { brawler: string })[] = SEM_REFERENCIAS) {
  // O mesmo interruptor do site todo (Draft, Mapas, Matriz): ver `useApiOficial`.
  const { ligada, alternar, dias, setDias, rank, setRank } = useApiOficial();
  const doRank = rank || undefined;

  const lista = trpc.observedMatches.partidas.useQuery({ dias, rank: doRank }, { enabled: ligada, staleTime: 120_000 });
  const mapa = lista.data?.mapas.find((entrada) => normalizarNome(entrada.nome) === normalizarNome(nomeDoMapa));
  const doMapa = trpc.observedMatches.partidas.useQuery(
    { dias, rank: doRank, mapId: mapa?.mapId },
    // A chave inclui o mapa, período e rank. Durante uma mudança não se usam
    // números da chave anterior como se pertencessem ao novo mapa.
    { enabled: ligada && Boolean(mapa?.mapId), staleTime: 120_000 },
  );
  const terreno = trpc.general.terreno.useQuery({ mapaId: mapa?.mapId ?? "" }, { enabled: ligada && Boolean(mapa?.mapId), staleTime: 10 * 60_000, retry: 1 });
  const referenciasMapa = useMemo(() => criarReferenciasDoMapa(linhasOriginais, perfisTaticosDoDraft(linhasOriginais.map(r => r.brawler)), nomeDoMapa, terreno.data), [linhasOriginais, nomeDoMapa, terreno.data]);
  const dados = useMemo<DadosDoMapaDaApi | undefined>(() => {
    if (!ligada) return undefined;
    if (!mapa) return lista.data ? { ...SEM_PARTIDAS, referenciasMapa } : undefined;
    if (!doMapa.data || terreno.isLoading) return undefined;
    return { ...doMapa.data, referenciasMapa, modeId: mapa.mode, priorModo: {
      brawlers: lista.data?.brawlersPorModo[mapa.mode] ?? [],
      confrontos: lista.data?.confrontosPorModo?.[mapa.mode] ?? [],
      sinergias: lista.data?.sinergiasPorModo?.[mapa.mode] ?? [],
      equipas: lista.data?.equipasPorModo?.[mapa.mode] ?? [],
    } };
  }, [ligada, mapa, lista.data, doMapa.data, referenciasMapa, terreno.isLoading]);

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
    terreno: terreno.data,
    dias,
    setDias,
    rank,
    setRank,
    erro: ligada ? lista.error?.message ?? doMapa.error?.message ?? null : null,
    aCarregar: ligada && (lista.isLoading || (Boolean(mapa?.mapId) && (doMapa.isLoading || terreno.isLoading))),
    /** Muda sempre que a fonte do motor muda — entra nas dependências do ranking. */
    versao,
    /** Todas as partidas do período (com a contagem de cada mapa), para a secção Mapas. */
    geral: ligada ? lista.data : undefined,
  };
}

/**
 * Preserva a taxa medida e os jogos para auditoria. A força ajustada recebe a
 * referência original deste mapa e um prior conservador sem evidência de
 * presença, sem importar resultados de terrenos distintos pelo modo.
 */
export function linhasDaApi<T extends { brawler: string }>(linhas: readonly T[], dados: DadosDoMapaDaApi = SEM_PARTIDAS): T[] {
  const nomeMapa = (linhas[0] as { map?: string } | undefined)?.map;
  const referenciasMapa = dados.referenciasMapa ?? criarReferenciasDoMapa(linhas, perfisTaticosDoDraft(linhas.map(l => l.brawler)), nomeMapa);
  const modelo = montarDadosDoMotorApi(linhas.map((l) => l.brawler), { ...dados, referenciasMapa });
  const porNome = new Map(dados.brawlers.map((linha) => [normalizarNome(linha.brawler), linha]));
  return linhas.map((linha) => {
    const contagem = porNome.get(normalizarNome(linha.brawler));
    const jogos = contagem?.jogos ?? 0;
    const vitorias = contagem?.vitorias ?? 0;
    return {
      ...linha,
      winRate: calcularWinRateBayesiano(modelo.estatisticasMapa[linha.brawler]) * 100,
      /** A vitória medida, sem o ajuste: é a que o ecrã mostra (a mesma da página «Partidas»). */
      vitoriaNaApi: jogos > 0 ? (vitorias / jogos) * 100 : null,
      usage: modelo.estatisticasMapa[linha.brawler].taxaUsoMapa * 100,
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
  brawlersPorMapa: Readonly<Record<string, ReadonlyArray<import("@shared/partidasObservadas").ContagemDeBrawler>>>;
  brawlersPorModo?: Readonly<Record<string, ReadonlyArray<import("@shared/partidasObservadas").ContagemDeBrawler>>>;
  partidasPonderadasPorMapa?: Record<string, number>;
};

/**
 * `linhasDaApi` para todos os mapas de uma vez (a secção Mapas da página
 * inicial): cada mapa recebe as partidas dele. Um mapa sem partidas fica com
 * um prior conservador e uso observado 0, apoiados nas referências próprias do mapa.
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
    return linhasDaApi(doMapa, { partidas: mapa?.partidas ?? 0, partidasPonderadas: mapa ? geral.partidasPonderadasPorMapa?.[mapa.mapId] : 0, brawlers, confrontos: [], sinergias: [], priorModo: { brawlers: geral.brawlersPorModo?.[((doMapa[0] as { modeId?: string }).modeId ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")] ?? [], confrontos: [], sinergias: [] } });
  }).flat();
}
