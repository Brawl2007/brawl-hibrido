import { describe, expect, it } from "vitest";
import {
  aggregatePublishedStarPlayerRate,
  aggregatePublishedUsageRate,
  aggregatePublishedWinRate,
  calculateHybridScoreForWinRateWeight,
  calculateHybridScoresByMap,
  hybridTierForScore,
  normalizeRateForMap,
  type UsageWinMetricRow,
} from "@shared/hybridScore";

/**
 * A normalização rápida dá EXATAMENTE os mesmos números que a lenta.
 *
 * POR QUE ISTO PRECISA DE UM TESTE PRÓPRIO
 *
 * `calculateHybridScoresByMap` deixou de pedir o mínimo e o máximo do mapa
 * linha a linha e passa a calculá-los uma vez por mapa. É uma mudança de
 * desempenho — 71 ms para 4,3 ms por passagem, medido com as 2808 linhas da
 * produção — e mudanças de desempenho no meio de uma fórmula são a forma mais
 * silenciosa de estragar um site: o número sai, ninguém vê erro nenhum, e está
 * errado.
 *
 * Por isso este ficheiro não testa "dá um resultado razoável". Escreve o
 * algoritmo ANTIGO por extenso, aqui ao lado, e exige igualdade exata entre os
 * dois em cima de dados gerados de propósito para expor diferenças: empates,
 * mapas inteiros com o mesmo valor, métricas em falta, mapas com uma só linha,
 * valores negativos e fora da escala.
 *
 * Se algum dia alguém voltar a mexer na normalização, é aqui que a diferença
 * aparece — e aparece como uma desigualdade de números, não como uma opinião.
 */

/** O algoritmo anterior, tal e qual: os extremos tirados da lista, por linha. */
function scoresPeloCaminhoAntigo<T extends UsageWinMetricRow>(
  rows: readonly T[],
  winRateWeight: number,
  topBrawlWeight: number,
  starPlayerWeight: number,
) {
  const metricsByMap = new Map<string, { winRate: number | null; usage: number | null; starPlayer: number | null }[]>();
  for (const row of rows) {
    const metrics = metricsByMap.get(row.map) ?? [];
    metrics.push({
      winRate: aggregatePublishedWinRate(row, topBrawlWeight),
      usage: aggregatePublishedUsageRate(row, topBrawlWeight),
      starPlayer: aggregatePublishedStarPlayerRate(row),
    });
    metricsByMap.set(row.map, metrics);
  }

  return rows.map((row) => {
    const winRate = aggregatePublishedWinRate(row, topBrawlWeight);
    const usage = aggregatePublishedUsageRate(row, topBrawlWeight);
    const starPlayer = aggregatePublishedStarPlayerRate(row);
    const mapMetrics = metricsByMap.get(row.map) ?? [];
    const winScore = normalizeRateForMap(winRate, mapMetrics.map((metric) => metric.winRate));
    const usageScore = normalizeRateForMap(usage, mapMetrics.map((metric) => metric.usage));
    const starScore = normalizeRateForMap(starPlayer, mapMetrics.map((metric) => metric.starPlayer));
    const score = calculateHybridScoreForWinRateWeight(winScore, usageScore, winRateWeight, starScore, starPlayerWeight);
    return score === null
      ? { ...row, winRate, usage }
      : { ...row, winRate, usage, score, tier: hybridTierForScore(score) };
  });
}

/**
 * Gerador determinista. Uma semente fixa para a falha ser sempre reproduzível:
 * um teste que falha de vez em quando é pior do que não existir.
 */
function sorteador(semente: number) {
  let estado = semente;
  return () => {
    estado = (estado * 1103515245 + 12345) & 0x7fffffff;
    return estado / 0x7fffffff;
  };
}

/** Um valor que tanto pode ser uma taxa como um buraco na fonte. */
function talvezNumero(sorteia: () => number, minimo: number, amplitude: number) {
  const dado = sorteia();
  if (dado < 0.12) return null;
  if (dado < 0.16) return undefined;
  return Number((minimo + sorteia() * amplitude).toFixed(2));
}

function conjuntoSorteado(semente: number, mapas: number, porMapa: number) {
  const sorteia = sorteador(semente);
  const rows: UsageWinMetricRow[] = [];
  for (let m = 0; m < mapas; m++) {
    // Alguns mapas inteiros com o mesmo valor: é o caso em que a normalização
    // devolve 50 em vez de dividir por zero, e é fácil perdê-lo numa reescrita.
    const achatado = sorteia() < 0.2;
    for (let i = 0; i < porMapa; i++) {
      rows.push({
        map: `Mapa ${m}`,
        topBrawlWinRate: achatado ? 50 : talvezNumero(sorteia, 30, 45),
        brawlPlanetWinRate: achatado ? 50 : talvezNumero(sorteia, 30, 45),
        topBrawlUseRate: achatado ? 10 : talvezNumero(sorteia, 0, 35),
        brawlPlanetPickRate: achatado ? 10 : talvezNumero(sorteia, 0, 35),
        brawlPlanetStarPlayer: achatado ? 20 : talvezNumero(sorteia, 0, 40),
      });
    }
  }
  return rows;
}

const PESOS: Array<[number, number, number]> = [
  [0.7, 0.5, 0],       // a fórmula oficial
  [0.5 / 0.7, 0.5, 0.3], // 50/30/20
  [0.95, 0.5, 0],      // o topo da escada de picks do Draft
  [0, 0, 1],           // só Star Player
  [1, 1, 0],           // só vitória, só TopBrawl
  [0.5, 0.25, 0.5],    // metade Star Player
];

describe("a normalização rápida é idêntica à lenta", () => {
  it("em 30 conjuntos sorteados × 6 divisões de pesos, número a número", () => {
    let linhasComparadas = 0;
    for (let semente = 1; semente <= 30; semente++) {
      const rows = conjuntoSorteado(semente, 6, 18);
      for (const [win, fonte, star] of PESOS) {
        const rapido = calculateHybridScoresByMap(rows, win, fonte, star);
        const lento = scoresPeloCaminhoAntigo(rows, win, fonte, star);
        expect(rapido).toEqual(lento);
        linhasComparadas += rows.length;
      }
    }
    // Uma rede desta dimensão não deixa passar um desvio de arredondamento.
    expect(linhasComparadas).toBe(30 * 6 * 108);
  });

  it("nos casos de fronteira que uma reescrita costuma partir", () => {
    const fronteiras: Array<[string, UsageWinMetricRow[]]> = [
      ["mapa com uma só linha", [
        { map: "Só Um", topBrawlWinRate: 55, brawlPlanetWinRate: 55, topBrawlUseRate: 12, brawlPlanetPickRate: 12, brawlPlanetStarPlayer: 22 },
      ]],
      ["mapa todo empatado", Array.from({ length: 5 }, () => ({
        map: "Empate", topBrawlWinRate: 50, brawlPlanetWinRate: 50, topBrawlUseRate: 10, brawlPlanetPickRate: 10, brawlPlanetStarPlayer: 20,
      }))],
      ["mapa sem nenhum Star Player", Array.from({ length: 5 }, (_, i) => ({
        map: "Sem Star", topBrawlWinRate: 40 + i, brawlPlanetWinRate: 40 + i, topBrawlUseRate: i, brawlPlanetPickRate: i, brawlPlanetStarPlayer: null,
      }))],
      ["mapa sem métrica nenhuma", Array.from({ length: 3 }, () => ({ map: "Vazio" }))],
      ["valores negativos e acima de 100", [
        { map: "Estranho", topBrawlWinRate: -20, brawlPlanetWinRate: -20, topBrawlUseRate: 0, brawlPlanetPickRate: 0, brawlPlanetStarPlayer: -5 },
        { map: "Estranho", topBrawlWinRate: 180, brawlPlanetWinRate: 180, topBrawlUseRate: 200, brawlPlanetPickRate: 200, brawlPlanetStarPlayer: 150 },
        { map: "Estranho", topBrawlWinRate: 50, brawlPlanetWinRate: 50, topBrawlUseRate: 10, brawlPlanetPickRate: 10, brawlPlanetStarPlayer: 20 },
      ]],
      ["lista vazia", []],
      ["vários mapas misturados sem ordem", [
        { map: "B", topBrawlWinRate: 60, topBrawlUseRate: 5, brawlPlanetStarPlayer: 30 },
        { map: "A", topBrawlWinRate: 40, topBrawlUseRate: 20, brawlPlanetStarPlayer: 10 },
        { map: "B", topBrawlWinRate: 45, topBrawlUseRate: 15, brawlPlanetStarPlayer: 5 },
        { map: "A", topBrawlWinRate: 55, topBrawlUseRate: 8, brawlPlanetStarPlayer: 25 },
      ]],
    ];

    for (const [nome, rows] of fronteiras) {
      for (const [win, fonte, star] of PESOS) {
        expect(
          calculateHybridScoresByMap(rows, win, fonte, star),
          `${nome}, pesos ${win}/${fonte}/${star}`,
        ).toEqual(scoresPeloCaminhoAntigo(rows, win, fonte, star));
      }
    }
  });

  it("a ordem das linhas à entrada é a ordem à saída", () => {
    // A reescrita passou a guardar as métricas num arranjo paralelo indexado
    // por posição. Se os índices se desalinharem, cada linha fica com o Score
    // de outra — e o site continua a parecer bem.
    const rows = conjuntoSorteado(99, 4, 9).map((row, i) => ({ ...row, brawler: `B${i}` }));
    const resultado = calculateHybridScoresByMap(rows, 0.7, 0.5, 0.3);
    expect(resultado.map((row) => row.brawler)).toEqual(rows.map((row) => row.brawler));
    expect(resultado.map((row) => row.map)).toEqual(rows.map((row) => row.map));
  });
});
