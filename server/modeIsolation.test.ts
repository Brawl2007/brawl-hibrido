import { afterEach, expect, it } from "vitest";
import { setCounterSyncSnapshot, getCounterSourceProfiles, isExcludedCounterDirection } from "../shared/counterSourceRelations";
import fs from "node:fs";
import { brawlScopeCaptureFileSchema } from "../shared/brawlScopeCapture";
import { getMatchupValue, getPublishedMatchupValue, setBrawlScopeReading, setBrawlScopeLiveMatchups } from "../shared/counterMatchupValue";
import { calculateDraftSignal } from "../shared/draft";
import { getSnapshotSynergies, type CounterSyncSnapshotPayload } from "../shared/counterSyncSnapshot";
const snapshot: CounterSyncSnapshotPayload = {
  schemaVersion: 2, capturedAt: "2026-09-13", sourceStates: {} as CounterSyncSnapshotPayload["sourceStates"],
  relations: [
    { owner: "Nori", attacker: "El Primo", defender: "Nori", direction: "counteredBy", source: "brawlscope", sourceUrl: "https://brawlscope.com/counters/nori?mode=knockout", modeId: "knockout", delta: 12.9 },
    { owner: "Nori", attacker: "Doug", defender: "Nori", direction: "counteredBy", source: "brawlscope", sourceUrl: "https://brawlscope.com/counters/nori", delta: 10 },
  ],
  synergies: [{ owner: "Nori", teammate: "Wendy", source: "brawlscope", sourceUrl: "https://brawlscope.com/counters/nori?mode=knockout", modeId: "knockout", rank: 1, delta: 10.8 }],
};
afterEach(() => {
  setCounterSyncSnapshot(undefined, { allowOfflineFallback: false });
  setBrawlScopeLiveMatchups("overall", null); setBrawlScopeLiveMatchups("knockout", null);
  for (const mode of ["bounty", "gemGrab", "brawlBall", "hotZone", "heist"]) setBrawlScopeLiveMatchups(mode, null);
  setBrawlScopeReading("overall");
});
it.skipIf(!process.env.BRAWL_CAPTURE_TEST_FILE)("matches every imported matrix row to its own view even with mode lists present", () => {
  const file = brawlScopeCaptureFileSchema.parse(JSON.parse(fs.readFileSync(process.env.BRAWL_CAPTURE_TEST_FILE!, "utf8")));
  const payload: CounterSyncSnapshotPayload = { ...snapshot, relations: [], synergies: [] };
  const matrices: Record<string, Record<string, Record<string, number>>> = {};
  for (const p of file.profiles) {
    const modeId = p.view === "overall" ? undefined : p.view;
    (matrices[p.view] ??= {})[p.brawler] = Object.fromEntries(p.rows.map(r => [r.opponent, r.delta]));
    for (const direction of ["targets", "counteredBy"] as const) {
      for (const r of p[direction]) payload.relations.push({ owner: p.brawler, source: "brawlscope", sourceUrl: p.url, direction, modeId, delta: r.delta, attacker: direction === "targets" ? p.brawler : r.brawler, defender: direction === "targets" ? r.brawler : p.brawler });
    }
  }
  setCounterSyncSnapshot(payload);
  for (const [view, matrix] of Object.entries(matrices)) setBrawlScopeLiveMatchups(view, matrix);
  let checked = 0;
  let excluded = 0;
  for (const p of file.profiles) for (const r of p.rows) {
    if (isExcludedCounterDirection(p.brawler, r.opponent) || isExcludedCounterDirection(r.opponent, p.brawler)) { excluded++; continue; }
    expect(getPublishedMatchupValue(p.brawler, r.opponent, p.view === "overall" ? undefined : p.view).base, `${p.brawler}/${p.view}/${r.opponent}`).toBe(r.delta);
    checked++;
  }
  console.log({ checked, excluded, profiles: file.profiles.length });
  expect(checked + excluded).toBe(file.profiles.reduce((sum, p) => sum + p.rows.length, 0));
}, 30000);
it("keeps Nocaute relations and synergies out of Geral, and avoids merging Geral into Nocaute", () => {
  setCounterSyncSnapshot(snapshot);
  expect(getCounterSourceProfiles("Nori").find(p => p.source === "BrawlScope")?.counteredBy.map(r => r.brawler)).toEqual(["Doug"]);
  expect(getCounterSourceProfiles("Nori", "knockout").find(p => p.source === "BrawlScope")?.counteredBy.map(r => r.brawler)).toEqual(["El Primo"]);
  expect(getSnapshotSynergies(snapshot, "Nori", "brawlscope")).toEqual([]);
  expect(getSnapshotSynergies(snapshot, "Nori", "brawlscope", "knockout")).toHaveLength(1);
});
it("switches the Draft counter points and lets the profile select a mode independently", () => {
  setCounterSyncSnapshot(snapshot);
  setBrawlScopeLiveMatchups("overall", { Nori: { "El Primo": 1.8 } });
  setBrawlScopeLiveMatchups("knockout", { Nori: { "El Primo": 12.9 } });
  const row = { brawler: "Nori", score: 70, tier: "A" as const };
  const context = { mapModeId: "knockout", enemyRows: [{ ...row, brawler: "El Primo" }] };
  setBrawlScopeReading("overall");
  expect(getMatchupValue("Nori", "El Primo", "knockout").base).toBe(-1.8);
  const general = calculateDraftSignal(row, context).scoreBreakdown.counterPoints;
  expect(getPublishedMatchupValue("Nori", "El Primo", "knockout").base).toBe(12.9);
  setBrawlScopeReading("byMode");
  expect(getMatchupValue("Nori", "El Primo", "knockout").base).toBe(-12.9);
  expect(calculateDraftSignal(row, context).scoreBreakdown.counterPoints).not.toBe(general);
  expect(getPublishedMatchupValue("Nori", "El Primo").base).toBe(1.8);
  setBrawlScopeLiveMatchups("knockout", { Nori: { "El Primo": 13.2 } });
  expect(getMatchupValue("Nori", "El Primo", "knockout").base).toBe(-13.2);
});
