import { describe, expect, it } from "vitest";
import { allRankedMaps, mapModeOverrides } from "./rankedData";

const expectedModes = {
  "Belle's Rock": ["Nocaute", "knockout"],
  "Bridge Too Far": ["Roubo", "heist"],
  "Center Stage": ["Fute-Brawl", "brawl-ball"],
  "Double Swoosh": ["Pique-Gema", "gem-grab"],
  "Dry Season": ["Caça-Estrelas", "bounty"],
  "Dueling Beetles": ["Zona Estratégica", "hot-zone"],
  "Flaring Phoenix": ["Nocaute", "knockout"],
  "Gem Fort": ["Pique-Gema", "gem-grab"],
  "Hard Rock Mine": ["Pique-Gema", "gem-grab"],
  Hideout: ["Caça-Estrelas", "bounty"],
  "Hot Potato": ["Roubo", "heist"],
  "Kaboom Canyon": ["Roubo", "heist"],
  "Layer Cake": ["Caça-Estrelas", "bounty"],
  "New Horizons": ["Nocaute", "knockout"],
  "Open Business": ["Zona Estratégica", "hot-zone"],
  "Out in the Open": ["Nocaute", "knockout"],
  "Parallel Plays": ["Zona Estratégica", "hot-zone"],
  "Pinball Dreams": ["Fute-Brawl", "brawl-ball"],
  "Ring of Fire": ["Zona Estratégica", "hot-zone"],
  "Safe Zone": ["Roubo", "heist"],
  "Shooting Star": ["Caça-Estrelas", "bounty"],
  "Sneaky Fields": ["Fute-Brawl", "brawl-ball"],
  "Spiraling Out": ["Fute-Brawl", "brawl-ball"],
  "Triple Dribble": ["Fute-Brawl", "brawl-ball"],
  Undermine: ["Pique-Gema", "gem-grab"],
} as const;

describe("ranked map modes", () => {
  it("keeps the complete current 26-map catalogue aligned to one official mode", () => {
    expect(Object.keys(mapModeOverrides)).toHaveLength(26);

    for (const [name, [mode, modeId]] of Object.entries(expectedModes)) {
      expect(mapModeOverrides[name]).toEqual({ mode, modeId });
    }

    expect(new Set(allRankedMaps.map((map) => map.name)).size).toBe(26);
  });

  it("does not place Safe Zone or Open Business in the wrong mode", () => {
    expect(mapModeOverrides["Safe Zone"]).toEqual({ mode: "Roubo", modeId: "heist" });
    expect(mapModeOverrides["Open Business"]).toEqual({ mode: "Zona Estratégica", modeId: "hot-zone" });

    expect(allRankedMaps.filter((map) => map.name === "Safe Zone").every((map) => map.modeId === "heist")).toBe(true);
    expect(allRankedMaps.filter((map) => map.name === "Open Business").every((map) => map.modeId === "hot-zone")).toBe(true);
  });
});
