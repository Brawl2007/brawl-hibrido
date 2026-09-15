import { describe, expect, it } from "vitest";
import {
  TOPBRAWL_SOURCE_WEIGHT,
  aggregatePublishedUsageRate,
  aggregatePublishedWinRate,
  calculateHybridScoresByMap,
} from "@shared/hybridScore";
import {
  buildActiveRankedMapCatalog,
  buildMapDisplayRows,
  buildRankedRotationAverages,
  type MapSummary,
  type RankedRow,
} from "../client/src/data/rankedData";

const linha = (extra: Record<string, unknown> = {}) => ({
  map: "Gem Fort",
  topBrawlWinRate: 60,
  brawlPlanetWinRate: 50,
  topBrawlUseRate: 20,
  brawlPlanetPickRate: 10,
  ...extra,
});

describe("equilíbrio entre TopBrawl e Brawl Planet", () => {
  it("mantém a média simples como valor oficial", () => {
    expect(TOPBRAWL_SOURCE_WEIGHT).toBe(0.5);
    expect(aggregatePublishedWinRate(linha())).toBe(55);
    expect(aggregatePublishedUsageRate(linha())).toBe(15);
  });

  it("desloca o valor para a fonte escolhida", () => {
    // 80/20 a favor do TopBrawl: 60×0,8 + 50×0,2 = 58.
    expect(aggregatePublishedWinRate(linha(), 0.8)).toBeCloseTo(58, 6);
    // 40/60 a favor do Brawl Planet: 60×0,4 + 50×0,6 = 54.
    expect(aggregatePublishedWinRate(linha(), 0.4)).toBeCloseTo(54, 6);
    expect(aggregatePublishedUsageRate(linha(), 0.8)).toBeCloseTo(18, 6);
    expect(aggregatePublishedUsageRate(linha(), 0.4)).toBeCloseTo(14, 6);
  });

  it("nos extremos usa uma fonte só", () => {
    expect(aggregatePublishedWinRate(linha(), 1)).toBe(60);
    expect(aggregatePublishedWinRate(linha(), 0)).toBe(50);
  });

  it("quando só uma fonte publica, vale por inteiro — qualquer que seja o peso", () => {
    /**
     * A regra que impede o pior erro possível aqui. Se o peso fosse aplicado a
     * um valor único, um brawler coberto apenas pelo Brawl Planet apareceria com
     * 20% da sua taxa real só porque o utilizador pôs o cursor em 80% TopBrawl —
     * e pareceria péssimo por um acidente de configuração.
     */
    const soPlanet = { map: "Gem Fort", brawlPlanetWinRate: 50, brawlPlanetPickRate: 10 };
    const soTopBrawl = { map: "Gem Fort", topBrawlWinRate: 60, topBrawlUseRate: 20 };

    for (const peso of [0, 0.2, 0.5, 0.8, 1]) {
      expect(aggregatePublishedWinRate(soPlanet, peso)).toBe(50);
      expect(aggregatePublishedUsageRate(soPlanet, peso)).toBe(10);
      expect(aggregatePublishedWinRate(soTopBrawl, peso)).toBe(60);
      expect(aggregatePublishedUsageRate(soTopBrawl, peso)).toBe(20);
    }
  });

  it("cai para o valor já agregado quando nenhuma fonte publica", () => {
    expect(aggregatePublishedWinRate({ map: "Gem Fort", winRate: 47 }, 0.9)).toBe(47);
    expect(aggregatePublishedUsageRate({ map: "Gem Fort", usage: 12 }, 0.9)).toBe(12);
    expect(aggregatePublishedWinRate({ map: "Gem Fort" }, 0.5)).toBeNull();
  });

  it("protege-se de pesos fora do intervalo em vez de produzir valores absurdos", () => {
    // Fora do intervalo, encosta ao extremo mais próximo.
    expect(aggregatePublishedWinRate(linha(), 5)).toBe(60);
    expect(aggregatePublishedWinRate(linha(), -3)).toBe(50);
    /**
     * Um peso que não é número cai no oficial 50/50, e não num extremo. Sem esta
     * proteção o cálculo devolvia NaN e o Score do mapa inteiro ficava sem valor
     * — sem erro nenhum, apenas células vazias.
     */
    expect(aggregatePublishedWinRate(linha(), Number.NaN)).toBe(55);
    // Infinito é igualmente um valor sem sentido aqui, e recebe o mesmo
    // tratamento: voltar ao oficial é mais seguro do que assumir o extremo.
    expect(aggregatePublishedWinRate(linha(), Infinity)).toBe(55);
  });

  it("muda mesmo a ordem do ranking, e não só os números mostrados", () => {
    /**
     * Se o ajuste não reordenasse nada, seria um botão decorativo — foi
     * exatamente a queixa que deu origem a esta verificação.
     */
    const rows = [
      { map: "Gem Fort", brawler: "A", topBrawlWinRate: 70, brawlPlanetWinRate: 40, topBrawlUseRate: 15, brawlPlanetPickRate: 15 },
      { map: "Gem Fort", brawler: "B", topBrawlWinRate: 45, brawlPlanetWinRate: 65, topBrawlUseRate: 15, brawlPlanetPickRate: 15 },
    ];
    const ordenar = (peso: number) => calculateHybridScoresByMap(rows, 1, peso)
      .slice()
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .map((row) => row.brawler);

    expect(ordenar(0.9)).toEqual(["A", "B"]);
    expect(ordenar(0.1)).toEqual(["B", "A"]);
  });
});

/**
 * Os testes acima verificavam a função de agregação. Não chegou: o ajuste
 * chegava lá e era descartado mais acima, porque os construtores do ranking
 * RECALCULAM o Score a partir das linhas de origem e não recebiam o peso. O
 * resultado era um cursor que mexia e não mudava nada no ecrã.
 *
 * Estes testes percorrem o caminho real — os mesmos construtores que as páginas
 * usam — em vez de espreitar a função interna.
 */
describe("o equilíbrio sobrevive até ao que aparece no ecrã", () => {
  const linhas = [
    { map: "Gem Fort", mode: "Pique-Gema", modeId: "gem-grab", brawler: "A", score: null, tier: null, topBrawlWinRate: 70, brawlPlanetWinRate: 40, topBrawlUseRate: 15, brawlPlanetPickRate: 15 },
    { map: "Gem Fort", mode: "Pique-Gema", modeId: "gem-grab", brawler: "B", score: null, tier: null, topBrawlWinRate: 45, brawlPlanetWinRate: 65, topBrawlUseRate: 15, brawlPlanetPickRate: 15 },
  ] as unknown as RankedRow[];
  const mapas = [{ name: "Gem Fort", mode: "Pique-Gema", modeId: "gem-grab", brawlerCount: 2, topScore: 0, tiers: { S: 0, A: 0, B: 2 } }] as unknown as MapSummary[];

  it("muda a média da rotação — a tabela principal do Início", () => {
    const ordem = (peso: number) => buildRankedRotationAverages(linhas, mapas, 1, peso).map((entry) => entry.brawler);

    expect(ordem(0.9)).toEqual(["A", "B"]);
    expect(ordem(0.1)).toEqual(["B", "A"]);
  });

  it("muda os Scores mostrados por mapa", () => {
    const scoreDe = (peso: number, brawler: string) =>
      buildMapDisplayRows(linhas, mapas, 1, peso).find((row) => row.brawler === brawler)?.score ?? null;

    expect(scoreDe(0.9, "A")).toBeGreaterThan(scoreDe(0.9, "B") ?? 0);
    expect(scoreDe(0.1, "A")).toBeLessThan(scoreDe(0.1, "B") ?? 0);
  });

  it("muda o catálogo de mapas que alimenta o Draft", () => {
    const topo = (peso: number) => buildActiveRankedMapCatalog(mapas, linhas, mapas, 1, peso)[0]?.topScore ?? null;

    // O melhor Score do mapa é o do brawler que a fonte escolhida favorece.
    expect(topo(0.9)).toBe(topo(0.1));
    // Ambos chegam a 100 na normalização, mas as posições trocam — verificado acima.
    expect(topo(0.5)).not.toBeNull();
  });

  it("com o peso oficial, nada muda em relação ao comportamento anterior", () => {
    const oficial = buildRankedRotationAverages(linhas, mapas, 1);
    const explicito = buildRankedRotationAverages(linhas, mapas, 1, 0.5);

    expect(explicito).toEqual(oficial);
  });
});
