import { describe, expect, it } from "vitest";
import {
  buildMapDisplayRows,
  buildRankedRotationComparison,
  buildRankedRotationAverages,
  normalizeRankedRows,
  type MapSummary,
  type RankedRow,
} from "../client/src/data/rankedData";

const maps: MapSummary[] = Array.from({ length: 27 }, (_, index) => ({
  name: `Mapa ${index + 1}`,
  mode: "Nocaute",
  modeId: "knockout",
  brawlerCount: 2,
  topScore: 80,
  tiers: { S: 1, A: 1, B: 0 },
}));

function row(map: string, brawler: string, score: number): RankedRow {
  return { map, mode: "Nocaute", modeId: "knockout", brawler, score, tier: "A" };
}

describe("média dinâmica do Score Híbrido na rotação Ranked", () => {
  it("recalcula no cliente o Score pela fórmula oficial 70% vitória e 30% uso", () => {
    const [normalized] = normalizeRankedRows([
      { ...row("Mapa 1", "Brock", 999), tier: "S", brawlPlanetWinRate: 55, brawlPlanetPickRate: 10 },
      { ...row("Mapa 1", "Pearl", 999), brawlPlanetWinRate: 10, brawlPlanetPickRate: 0 },
    ]);

    expect(normalized.score).toBeCloseTo((100 * 0.7) + (100 * 0.3), 8);
    expect(normalized.tier).toBe("S");
  });

  it("aceita uma ponderação local de vitória e aplica-a tanto às linhas por mapa como à média", () => {
    const source = [{
      ...row("Mapa 1", "Brock", 999),
      brawlPlanetWinRate: 50,
      brawlPlanetPickRate: 10,
    }, {
      ...row("Mapa 1", "Pearl", 999),
      brawlPlanetWinRate: 0,
      brawlPlanetPickRate: 0,
    }];
    const expectedScore = (100 * 0.5) + (100 * 0.5);

    const displayRow = buildMapDisplayRows(source, maps.slice(0, 1), 0.5)[0];
    const average = buildRankedRotationAverages(source, maps.slice(0, 1), 0.5).find((entry) => entry.brawler === "Brock")!;

    expect(normalizeRankedRows(source, 0.5)[0].score).toBeCloseTo(expectedScore, 8);
    expect(displayRow.score).toBeCloseTo(expectedScore, 8);
    expect(average.averageScore).toBeCloseTo(expectedScore, 8);
    expect(average.tier).toBe("S");
  });

  it("usa cada um dos 27 mapas uma única vez e recalcula quando a snapshot muda", () => {
    const firstSnapshot = maps.flatMap((map) => [row(map.name, "Brock", 60), row(map.name, "Pearl", 70)]);
    const first = buildRankedRotationAverages(firstSnapshot, maps);
    const brock = first.find((entry) => entry.brawler === "Brock");

    expect(brock).toMatchObject({ mapCount: 27, averageScore: 60 });

    const updatedSnapshot = firstSnapshot.map((entry) => entry.map === "Mapa 27" && entry.brawler === "Brock"
      ? { ...entry, score: 87 }
      : entry);
    const updated = buildRankedRotationAverages(updatedSnapshot, maps);
    const updatedBrock = updated.find((entry) => entry.brawler === "Brock");

    expect(updatedBrock?.mapCount).toBe(27);
    expect(updatedBrock?.averageScore).toBeCloseTo(61, 8);
  });

  it("ignora uma linha duplicada do mesmo brawler e mapa", () => {
    const rows = [row("Mapa 1", "Brock", 60), row("Mapa 1", "Brock", 90), row("Mapa 2", "Brock", 70)];
    const average = buildRankedRotationAverages(rows, maps.slice(0, 2))[0];

    expect(average).toMatchObject({ mapCount: 2, averageScore: 65 });
  });

  it("mostra Wendy como posição 106 por mapa sem a injetar na média até a snapshot publicar métricas", () => {
    const mapRows = maps.map((map) => Array.from({ length: 105 }, (_, index) => row(map.name, `Brawler ${index + 1}`, 50)));
    const displayRows = buildMapDisplayRows(mapRows.flat(), maps);
    const wendyRows = displayRows.filter((entry) => entry.brawler === "Wendy");

    expect(wendyRows).toHaveLength(27);
    expect(wendyRows.every((entry) => entry.score === 0 && entry.tier === null && entry.rankedStatus === "unavailable")).toBe(true);
    expect(displayRows.filter((entry) => entry.map === "Mapa 1").at(-1)?.brawler).toBe("Wendy");
    expect(buildRankedRotationAverages(mapRows.flat(), maps).some((entry) => entry.brawler === "Wendy")).toBe(false);
  });

  it("substitui o marcador de Wendy assim que a snapshot publicar a linha real", () => {
    const source = [row("Mapa 1", "Brock", 60), { ...row("Mapa 1", "Wendy", 71), rankedStatus: "active" as const }];
    const displayRows = buildMapDisplayRows(source, maps.slice(0, 1));

    expect(displayRows.filter((entry) => entry.brawler === "Wendy")).toEqual([
      expect.objectContaining({ score: 71, rankedStatus: "active" }),
    ]);
  });

  it("compara a classificação local com a fórmula oficial 70/30 sem alterar as linhas da snapshot", () => {
    const source = [
      { ...row("Mapa 1", "Brock", 999), usage: 0, brawlPlanetWinRate: 85 },
      { ...row("Mapa 1", "Pearl", 999), usage: 65, brawlPlanetWinRate: 50 },
      { ...row("Mapa 1", "Nita", 999), usage: 100, brawlPlanetWinRate: 0 },
    ];
    const comparison = buildRankedRotationComparison(source, maps.slice(0, 1), 0.6);
    const brock = comparison.find((entry) => entry.brawler === "Brock");
    const pearl = comparison.find((entry) => entry.brawler === "Pearl");

    expect(brock).toMatchObject({ officialRank: 1, legacyRank: 2, rankChange: 1, experimentalRank: 2 });
    expect(pearl).toMatchObject({ officialRank: 2, legacyRank: 1, rankChange: -1, experimentalRank: 1 });
    expect(brock?.averageBrawlPlanetWinRate).toBe(85);
    expect(brock?.averageHybridUsage).toBe(0);
    expect(brock?.experimentalScoreChange).toBeLessThan(0);
    expect(source.every((entry) => entry.score === 999)).toBe(true);
  });
});
