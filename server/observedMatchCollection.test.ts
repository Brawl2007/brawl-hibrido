import { describe, expect, it } from "vitest";
import { createMatchupDeltas, normalizeObservedBattle, normalizeObservedMode, resolveObservedMapId } from "./observedMatchCollection";

const rankedBattle = {
  battleTime: "20260816T184500.000Z",
  event: { id: 15000025, mode: "brawlBall", map: "Triple Dribble" },
  battle: {
    type: "ranked",
    result: "victory",
    teams: [
      [
        { tag: "#ENEMY1", brawler: { name: "Bibi" } },
        { tag: "#ENEMY2", brawler: { name: "Max" } },
      ],
      [
        { tag: "#SOURCE", brawler: { name: "Bea" } },
        { tag: "#ALLY", brawler: { name: "Piper" } },
      ],
    ],
  },
} as const;

describe("observed Ranked battle collection", () => {
  it("records only the winning source team and creates symmetric pair observations", () => {
    const battle = normalizeObservedBattle(rankedBattle, "#SOURCE");

    expect(battle).not.toBeNull();
    expect(battle).toMatchObject({
      mapId: "15000025",
      mode: "brawlball",
      winningTeam: ["Bea", "Piper"],
      losingTeam: ["Bibi", "Max"],
      sourcePlayerTag: "#SOURCE",
    });
    expect(battle?.deltas).toContainEqual({
      mapId: "15000025",
      mode: "brawlball",
      brawler: "Bea",
      opponent: "Bibi",
      wins: 1,
      losses: 0,
    });
    expect(battle?.deltas).toContainEqual({
      mapId: "15000025",
      mode: "brawlball",
      brawler: "Bibi",
      opponent: "Bea",
      wins: 0,
      losses: 1,
    });
    expect(battle?.deltas).toHaveLength(8);
  });

  it("inverts the teams when the observed source loses", () => {
    const battle = normalizeObservedBattle(
      { ...rankedBattle, battle: { ...rankedBattle.battle, result: "defeat" } },
      "#SOURCE"
    );

    expect(battle?.winningTeam).toEqual(["Bibi", "Max"]);
    expect(battle?.losingTeam).toEqual(["Bea", "Piper"]);
    expect(battle?.deltas).toContainEqual(expect.objectContaining({ brawler: "Bea", opponent: "Bibi", losses: 1 }));
  });

  it("rejects non-Ranked, tied or source-less entries instead of inventing a winner", () => {
    expect(normalizeObservedBattle({ ...rankedBattle, battle: { ...rankedBattle.battle, type: "soloRanked" } }, "#SOURCE")).toBeNull();
    expect(normalizeObservedBattle({ ...rankedBattle, battle: { ...rankedBattle.battle, result: "draw" } }, "#SOURCE")).toBeNull();
    expect(normalizeObservedBattle(rankedBattle, "#MISSING")).toBeNull();
  });

  it("uses every winner-versus-loser pair in both directions", () => {
    const deltas = createMatchupDeltas("map", "mode", ["Bea", "Piper"], ["Bibi"]);
    expect(deltas).toHaveLength(4);
    expect(deltas).toContainEqual(expect.objectContaining({ brawler: "Piper", opponent: "Bibi", wins: 1 }));
    expect(deltas).toContainEqual(expect.objectContaining({ brawler: "Bibi", opponent: "Piper", losses: 1 }));
  });

  it("normalizes the official mode and restricts the collection to known Ranked maps", () => {
    expect(normalizeObservedMode("brawlBall")).toBe("brawlball");
    expect(resolveObservedMapId("Triple Dribble")).toBe("15000025");
    expect(resolveObservedMapId("Mapa fora da rotação")).toBeNull();
  });
});
