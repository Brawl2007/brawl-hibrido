import { describe, expect, it } from "vitest";
import { allMapSummaries, allRankedMaps, buildActiveRankedMapCatalog, buildRankedRotationAverages, mapModeOverrides, resolveRankedMapSelection, type RankedRow } from "../client/src/data/rankedData";
import { normalizeSnapshotPayload, RANKED_MAP_SOURCES } from "./rankedSync";

const expectedModes = {
  "Belle's Rock": "Nocaute",
  "Bridge Too Far": "Roubo",
  "Center Stage": "Fute-Brawl",
  "Double Swoosh": "Pique-Gema",
  "Dry Season": "Caça-Estrelas",
  "Dueling Beetles": "Zona Estratégica",
  "Flaring Phoenix": "Nocaute",
  "Gem Fort": "Pique-Gema",
  "Hard Rock Mine": "Pique-Gema",
  "Hideout": "Caça-Estrelas",
  "Hot Potato": "Roubo",
  "Kaboom Canyon": "Roubo",
  "Layer Cake": "Caça-Estrelas",
  "New Horizons": "Nocaute",
  "Open Business": "Zona Estratégica",
  "Out in the Open": "Nocaute",
  "Parallel Plays": "Zona Estratégica",
  "Pinball Dreams": "Fute-Brawl",
  "Ring of Fire": "Zona Estratégica",
  "Safe Zone": "Roubo",
  "Shooting Star": "Caça-Estrelas",
  "Sneaky Fields": "Fute-Brawl",
  "Spiraling Out": "Fute-Brawl",
  "Triple Dribble": "Fute-Brawl",
  "Undermine": "Pique-Gema",
  "Beach Ball": "Fute-Brawl",
} as const;

describe("ranked map mode integrity", () => {
  it("keeps the 28-map catalogue on one official mode per map", () => {
    expect(allRankedMaps).toHaveLength(26);
    expect(Object.keys(mapModeOverrides)).toHaveLength(26);

    for (const [map, mode] of Object.entries(expectedModes)) {
      const catalogMap = allRankedMaps.find((entry) => entry.name === map);
      expect(catalogMap?.mode, `${map} mode`).toBe(mode);
      expect(mapModeOverrides[map]?.mode, `${map} override`).toBe(mode);
    }
  });

  it("keeps the server source slugs aligned with the same 28 maps", () => {
    expect(RANKED_MAP_SOURCES).toHaveLength(26);
    const sourceNames = RANKED_MAP_SOURCES.map(([map]) => map);

    expect(new Set(sourceNames).size).toBe(26);
    for (const map of Object.keys(expectedModes)) {
      expect(sourceNames).toContain(map);
    }

    expect(RANKED_MAP_SOURCES.find(([map]) => map === "Spiraling Out")?.[2]).toBe("spiralingout_brawlball");
    expect(RANKED_MAP_SOURCES.find(([map]) => map === "Open Business")?.[2]).toContain("hotzone");
    expect(sourceNames).not.toContain("Crystal Arcade");
    expect(sourceNames).not.toContain("Deathcap Trap");
  });

  it("serves exactly 28 unique canonical maps after snapshot normalization", () => {
    const normalized = normalizeSnapshotPayload({
      rows: [],
      maps: allMapSummaries,
      updatedAt: "2026-08-14T00:00:00.000Z",
      sourceStatus: { topBrawl: "bundled", brawlPlanet: "bundled" },
    });

    expect(normalized.maps).toHaveLength(26);
    expect(new Set(normalized.maps.map((map) => map.name)).size).toBe(26);
    for (const [name, mode] of Object.entries(expectedModes)) {
      expect(normalized.maps.find((map) => map.name === name)?.mode).toBe(mode);
    }
  });

  it("drops removed-map rows and repairs current-map modes in persisted snapshots before serving them", () => {
    const normalized = normalizeSnapshotPayload({
      rows: [
        { map: "Deathcap Trap", mode: "Fute-Brawl", modeId: "brawl-ball", brawler: "Brock", score: null, tier: null },
        { map: "Spiraling Out", mode: "Roubo", modeId: "heist", brawler: "Brock", score: null, tier: null },
      ],
      maps: [
        { name: "Open Business", mode: "Roubo", modeId: "heist", brawlerCount: 105, topScore: 0, tiers: { S: 0, A: 0, B: 105 } },
        { name: "Open Business", mode: "Fute-Brawl", modeId: "brawl-ball", brawlerCount: 105, topScore: 0, tiers: { S: 0, A: 0, B: 105 } },
      ],
      updatedAt: "2026-08-14T00:00:00.000Z",
      sourceStatus: { topBrawl: "partial", brawlPlanet: "partial" },
    });

    // Um snapshot parcial deixou de substituir a tabela inteira: a base bundled
    // preenche os registos em falta e as linhas live têm precedência sobre ela.
    // Sem isto, um único brawler recebido virava artificialmente o melhor do mapa.
    expect(normalized.rows.filter((row) => row.map === "Spiraling Out" && row.brawler === "Brock")).toEqual([
      expect.objectContaining({ map: "Spiraling Out", mode: "Fute-Brawl", modeId: "brawl-ball" }),
    ]);
    expect(normalized.rows.some((row) => row.map === "Deathcap Trap")).toBe(false);
    expect(new Set(normalized.rows.map((row) => row.map)).size).toBe(26);
    expect(normalized.rows.length).toBeGreaterThan(26);
    expect(normalized.maps).toHaveLength(26);
    expect(normalized.maps.find((map) => map.name === "Open Business")).toMatchObject({ mode: "Zona Estratégica", modeId: "hot-zone" });
    expect(normalized.maps.find((map) => map.name === "Spiraling Out")).toMatchObject({ mode: "Fute-Brawl", modeId: "brawl-ball" });
    expect(normalized.maps.find((map) => map.name === "Deathcap Trap")).toBeUndefined();
  });

  it("builds the Draft catalogue from the same active Ranked rows and repairs an unavailable selection", () => {
    const activeRows: RankedRow[] = [
      { map: "Open Business", mode: "Roubo", modeId: "heist", brawler: "Brock", score: 72, tier: "A" },
      { map: "Open Business", mode: "Roubo", modeId: "heist", brawler: "Gale", score: 80, tier: "S" },
      { map: "Deathcap Trap", mode: "Fute-Brawl", modeId: "brawl-ball", brawler: "Nita", score: 66, tier: "A" },
    ];
    const activeMaps = buildActiveRankedMapCatalog([
      { name: "Open Business", mode: "Roubo", modeId: "heist", brawlerCount: 105, topScore: 0, tiers: { S: 0, A: 0, B: 105 } },
    ], activeRows, allMapSummaries);

    expect(activeMaps.map((map) => map.name)).toEqual(["Open Business"]);
    expect(activeMaps[0]).toMatchObject({
      name: "Open Business",
      mode: "Zona Estratégica",
      modeId: "hot-zone",
      brawlerCount: 2,
      topScore: 80,
      tiers: { S: 1, A: 1, B: 0 },
    });
    expect(resolveRankedMapSelection(activeMaps, "Mapa removido")?.name).toBe("Open Business");
    expect(resolveRankedMapSelection(activeMaps, "Deathcap Trap")?.name).toBe("Open Business");
  });

  it("calculates one hybrid average per brawler across the active map rotation", () => {
    const rotationRows: RankedRow[] = [
      { map: "Open Business", mode: "Roubo", modeId: "heist", brawler: "Brock", score: 60, tier: "B", brawlerId: 16000001 },
      { map: "Safe(r) Zone", mode: "Fute-Brawl", modeId: "brawl-ball", brawler: "Brock", score: 80, tier: "S", brawlerId: 16000001 },
      { map: "Open Business", mode: "Roubo", modeId: "heist", brawler: "Gale", score: 90, tier: "S" },
      { map: "Mapa fora da rotação", mode: "Ranked", modeId: "ranked", brawler: "Brock", score: 10, tier: "B" },
      { map: "Safe(r) Zone", mode: "Fute-Brawl", modeId: "brawl-ball", brawler: "Nita", score: null, tier: null },
    ];
    const activeMaps = [
      { name: "Open Business", mode: "Zona Estratégica", modeId: "hot-zone", brawlerCount: 2, topScore: 90, tiers: { S: 1, A: 0, B: 1 } },
      { name: "Safe(r) Zone", mode: "Roubo", modeId: "heist", brawlerCount: 2, topScore: 80, tiers: { S: 1, A: 0, B: 1 } },
    ];

    const averages = buildRankedRotationAverages(rotationRows, activeMaps);

    expect(averages).toHaveLength(2);
    expect(averages[0]).toMatchObject({ brawler: "Gale", averageScore: 90, mapCount: 1, tier: "S" });
    expect(averages[1]).toMatchObject({ brawler: "Brock", averageScore: 70, mapCount: 2, tier: "A", brawlerId: 16000001 });
  });

  it("recalculates the hybrid average when the rotation is limited to one game mode", () => {
    const rotationRows: RankedRow[] = [
      { map: "Open Business", mode: "Zona Estratégica", modeId: "hot-zone", brawler: "Brock", score: 72, tier: "A" },
      { map: "Parallel Plays", mode: "Zona Estratégica", modeId: "hot-zone", brawler: "Brock", score: 88, tier: "S" },
      { map: "Safe(r) Zone", mode: "Roubo", modeId: "heist", brawler: "Brock", score: 40, tier: "B" },
      { map: "Open Business", mode: "Zona Estratégica", modeId: "hot-zone", brawler: "Gale", score: 75, tier: "S" },
      { map: "Safe(r) Zone", mode: "Roubo", modeId: "heist", brawler: "Nita", score: 81, tier: "S" },
    ];
    const activeMaps = [
      { name: "Open Business", mode: "Zona Estratégica", modeId: "hot-zone", brawlerCount: 2, topScore: 75, tiers: { S: 1, A: 1, B: 0 } },
      { name: "Parallel Plays", mode: "Zona Estratégica", modeId: "hot-zone", brawlerCount: 1, topScore: 88, tiers: { S: 1, A: 0, B: 0 } },
      { name: "Safe(r) Zone", mode: "Roubo", modeId: "heist", brawlerCount: 2, topScore: 81, tiers: { S: 1, A: 0, B: 1 } },
    ];

    const hotZoneMaps = activeMaps.filter((map) => map.mode === "Zona Estratégica");
    const averages = buildRankedRotationAverages(rotationRows, hotZoneMaps);

    expect(averages).toEqual([
      expect.objectContaining({ brawler: "Brock", averageScore: 80, mapCount: 2, tier: "S" }),
      expect.objectContaining({ brawler: "Gale", averageScore: 75, mapCount: 1, tier: "S" }),
    ]);
    expect(averages.find((row) => row.brawler === "Nita")).toBeUndefined();
  });
});
