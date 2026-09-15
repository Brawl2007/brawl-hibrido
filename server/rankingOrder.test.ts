import { expect, it } from "vitest";
import { calculateHybridScoresByMap } from "../shared/hybridScore";
import { orderDraftEntries, rankDraftEntries } from "../shared/draft";
import { allRankedRows, normalizeRankedRows } from "../client/src/data/rankedData";

it("places Nita above Bonnie at equal victory and higher usage despite stale imported scores", () => {
  const rows = calculateHybridScoresByMap([
    { brawler: "Bonnie", map: "Test", winRate: 50, usage: 0, score: 99 },
    { brawler: "Nita", map: "Test", winRate: 50, usage: 4, score: 1 },
  ], .7);
  const entries = rankDraftEntries(rows, new Set());
  const ordered = orderDraftEntries(entries, "base");
  expect(ordered.map(e => e.row.brawler)).toEqual(["Nita", "Bonnie"]);
  expect(ordered.map(e => e.rank)).toEqual([1, 2]);
  expect(rows[1].score).toBeGreaterThan(rows[0].score!);
  expect(orderDraftEntries(entries, "context").map(e => e.draftScore)).toEqual(entries.map(e => e.draftScore));
});

it("recalculates the base when the user changes victory/usage weights", () => {
  const rows = [{ brawler: "Bonnie", map: "Test", winRate: 60, usage: 0 }, { brawler: "Nita", map: "Test", winRate: 50, usage: 4 }];
  for (const [weight, winner] of [[.7, "Bonnie"], [.3, "Nita"]] as const) {
    const normalized = calculateHybridScoresByMap(rows, weight);
    expect(orderDraftEntries(rankDraftEntries(normalized, new Set()), "base")[0].row.brawler).toBe(winner);
  }
});

it("keeps 70/30 base scoring monotonic for equal victory across the entire bundled roster", () => {
  const rows = normalizeRankedRows(allRankedRows, .7);
  let checked = 0;
  for (const left of rows) for (const right of rows) {
    if (left.map !== right.map || typeof left.winRate !== "number" || left.winRate !== right.winRate
      || typeof left.usage !== "number" || typeof right.usage !== "number" || left.usage <= right.usage) continue;
    expect(left.score, `${left.map}: ${left.brawler} vs ${right.brawler}`).toBeGreaterThan(right.score!);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
});
