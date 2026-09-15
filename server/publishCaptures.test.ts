import { expect, it } from "vitest";
import { applyCapturedProfiles } from "../shared/publishCaptures";
import type { CounterSyncSnapshotPayload } from "../shared/counterSyncSnapshot";
import type { BrawlScopeCapture } from "../shared/brawlScopeCapture";
it("updates only the captured owner and mode, including clearing old synergies", () => {
  const base = { owner: "Nori", direction: "targets" as const, attacker: "Nori", defender: "Doug", source: "brawlscope" as const, sourceUrl: "https://brawlscope.com/counters/nori", delta: 1 };
  const others = [{ ...base, modeId: "heist", delta: 8 }, { ...base, source: "prodigy" as const }, { ...base, owner: "Nita" }];
  const previous = { schemaVersion: 2, capturedAt: "old", sourceStates: { brawlscope: { status: "partial" } }, relations: [base, ...others], synergies: [{ owner: "Nori", teammate: "Doug", rank: 1, source: "brawlscope", sourceUrl: base.sourceUrl }], absenceStreaks: {} } as CounterSyncSnapshotPayload;
  const capture = { url: base.sourceUrl, brawler: "Nori", view: "overall", capturedAt: "2026-09-14T00:00:00.000Z", expectedCount: 1, rows: [{ opponent: "Doug", rate: 50, average: 50, delta: 0 }], targets: [], counteredBy: [{ brawler: "Jacky", delta: 8.3 }], synergies: [] } as BrawlScopeCapture;
  const updated = applyCapturedProfiles(previous, [capture], "new");
  expect(updated.relations).toHaveLength(4);
  for (const other of others) expect(updated.relations).toContainEqual(other);
  expect(updated.relations.at(-1)).toMatchObject({ attacker: "Jacky", defender: "Nori", delta: 8.3 });
  expect(updated.synergies).toEqual([]);
  expect(previous.relations).toHaveLength(4);
  expect(applyCapturedProfiles(updated, [capture], "new").relations).toEqual(updated.relations);
});
it("uses the same view key for gem-grab and gemGrab", () => {
  const previous = { schemaVersion: 2, capturedAt: "old", sourceStates: { brawlscope: { status: "partial" } }, relations: [{ owner: "Nori", attacker: "Nori", defender: "Doug", direction: "targets", source: "brawlscope", modeId: "gem-grab", sourceUrl: "https://brawlscope.com/counters/nori?mode=gemGrab" }], absenceStreaks: {} } as CounterSyncSnapshotPayload;
  const capture = { brawler: "Nori", view: "gemGrab", url: "https://brawlscope.com/counters/nori?mode=gemGrab", capturedAt: "2026-09-14T00:00:00.000Z", rows: [], expectedCount: 0, targets: [], counteredBy: [], synergies: [] } as BrawlScopeCapture;
  expect(applyCapturedProfiles(previous, [capture], "new").relations).toEqual([]);
});
