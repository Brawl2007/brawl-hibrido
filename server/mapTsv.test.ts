import { describe, expect, it } from "vitest";
import { allRankedMaps } from "../client/src/data/rankedData";
import { buildMapsTsv, MAP_TSV_HEADER } from "../shared/mapTsv";

describe("map TSV export", () => {
  it("exports the complete canonical catalogue in order", () => {
    const uniqueMaps = Array.from(new Map(allRankedMaps.map((map) => [map.name, map])).values());
    const lines = buildMapsTsv(uniqueMaps).split("\n");

    expect(lines[0]).toBe(MAP_TSV_HEADER);
    expect(lines).toHaveLength(27);
    expect(lines.slice(1).every((line) => line.split("\t").length === 2)).toBe(true);
    expect(lines[1]).toBe("Belle's Rock\tNocaute");
    expect(lines).toContain("Spiraling Out\tFute-Brawl");
    expect(lines).toContain("Beach Ball\tFute-Brawl");
    expect(lines).not.toContain("Pit Stop\tRoubo");
    expect(lines).not.toContain("Safe(r) Zone\tRoubo");
    expect(lines).not.toContain("Crystal Arcade\tPique-Gema");
    expect(lines).not.toContain("Deathcap Trap\tPique-Gema");
  });

  it("removes tabs and line breaks from fields without changing columns", () => {
    const tsv = buildMapsTsv([{ name: "Map\twith\nnoise", mode: "Modo\r\nseguro" }]);

    expect(tsv).toBe("Mapa\tModo\nMap with noise\tModo seguro");
    expect(tsv.split("\n")[1].split("\t")).toHaveLength(2);
  });
});
