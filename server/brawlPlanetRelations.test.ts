import { describe, expect, it } from "vitest";
import { allRankedRows } from "../client/src/data/rankedData";
import { brawlPlanetRelationData } from "../shared/brawlPlanetRelationData";

function relationKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

describe("Brawl Planet relation data", () => {
  it("keeps a public source profile for every brawler in the ranked catalog", () => {
    const relationProfiles = Object.values(brawlPlanetRelationData);
    const profileKeys = new Set(relationProfiles.map((profile) => relationKey(profile.brawler)));
    const roster = [...new Set(allRankedRows.map((row) => row.brawler))];

    expect(relationProfiles).toHaveLength(106);
    expect(roster).toHaveLength(106);
    for (const brawler of roster) {
      expect(profileKeys.has(relationKey(brawler))).toBe(true);
    }
  });

  it("preserves the four literal five-item lists and the source URL of every public Brawl Planet profile", () => {
    for (const profile of Object.values(brawlPlanetRelationData)) {
      expect(profile.sourceUrl).toMatch(/^https:\/\/www\.brawlplanet\.com\/brawlers\/[^/]+$/);
      expect(profile.bestTeammates).toHaveLength(5);
      expect(profile.worstTeammates).toHaveLength(5);
      expect(profile.strongAgainst).toHaveLength(5);
      expect(profile.strugglesAgainst).toHaveLength(5);

      for (const relation of [...profile.bestTeammates, ...profile.worstTeammates, ...profile.strongAgainst, ...profile.strugglesAgainst]) {
        expect(relation.brawler).toBeTruthy();
        expect(relation.delta).toBeTypeOf("number");
      }
      expect(profile.worstTeammates.every((relation) => relation.delta < 0)).toBe(true);
    }
  });

  it("keeps the direct 8-Bit relations parsed from its Brawl Planet profile", () => {
    const eightBit = brawlPlanetRelationData["8-bit"];

    expect(eightBit.bestTeammates[0]).toEqual({ brawler: "Nori", delta: 3.7 });
    expect(eightBit.worstTeammates[0]).toEqual({ brawler: "Charlie", delta: -4.9 });
    expect(eightBit.strongAgainst[0]).toEqual({ brawler: "Jacky", delta: 4.1 });
    expect(eightBit.strugglesAgainst[0]).toEqual({ brawler: "Ziggy", delta: -7.1 });
  });
});
