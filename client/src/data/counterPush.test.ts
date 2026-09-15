import { applyCounterSnapshotToClientState, type CounterSyncClientState } from "@shared/counterSyncClient";
import { rankDraftEntries, type DraftRow } from "@shared/draft";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import {
  getCounterSourceProfiles,
  setCounterSyncSnapshot,
} from "@shared/counterSourceRelations";
import {
  parseCounterSnapshotEvent,
  type CounterSyncSnapshotPayload,
} from "@shared/counterSyncSnapshot";

const sourceState = {
  status: "success" as const,
  complete: true,
  fetchedAt: "2026-09-06T06:30:00.000Z",
  brawlers: ["Bibi", "Surge"],
  relationCount: 1,
};

function createSnapshot(): CounterSyncSnapshotPayload {
  return {
    schemaVersion: 2,
    capturedAt: "2026-09-06T06:30:00.000Z",
    sourceStates: {
      brawlscope: sourceState,
      calculator: sourceState,
      planet: sourceState,
      prodigy: sourceState,
    },
    relations: [
      {
        owner: "Bibi",
        direction: "targets",
        attacker: "Bibi",
        defender: "Surge",
        source: "brawlscope",
        sourceUrl: "https://brawlscope.com/counters?brawler=bibi",
      },
    ],
    absenceStreaks: {},
  };
}

afterEach(() => {
  setCounterSyncSnapshot(undefined);
});

describe("counter_snapshot push", () => {
  it("parses the SSE event and applies its relations to the profile resolver", () => {
    const payload = createSnapshot();
    const event = parseCounterSnapshotEvent(JSON.stringify({
      version: "counter-live-42",
      capturedAt: payload.capturedAt,
      payload,
    }));

    setCounterSyncSnapshot(event.payload);

    const bibiProfile = getCounterSourceProfiles("Bibi");
    const brawlScope = bibiProfile.find((profile) => profile.source === "BrawlScope");

    expect(event.version).toBe("counter-live-42");
    expect(event.payload.relations).toHaveLength(1);
    expect(brawlScope?.targets.map((relation) => relation.brawler)).toContain("Surge");
  });

  it("applies newer query fallbacks after SSE and rejects delayed older snapshots", () => {
    const payload = createSnapshot();
    const first = { version: "counter-1", capturedAt: payload.capturedAt, payload };
    const pushed = applyCounterSnapshotToClientState({ hasLivePush: false }, first);
    const newer = { version: "counter-2", capturedAt: "2026-09-07T00:00:00Z", payload: { ...payload, relations: [] } };
    const queried = applyCounterSnapshotToClientState(pushed, newer, "query");
    expect(queried).toMatchObject({ version: "counter-2", hasLivePush: true, snapshot: { relations: [] } });
    expect(applyCounterSnapshotToClientState(queried, first)).toBe(queried);
    expect(applyCounterSnapshotToClientState(queried, newer)).toBe(queried);
  });

  it("changes Draft scores after counterSnapshotVersion updates and keeps the UI memo chain subscribed", () => {
    const row: DraftRow = { brawler: "Bibi", map: "Test", mode: "Fute-Brawl", modeId: "brawl-ball", score: 75, tier: "A" };
    const enemy: DraftRow = { ...row, brawler: "Surge" };
    let state: CounterSyncClientState = { hasLivePush: false };
    const calculate = (payload: CounterSyncSnapshotPayload, version: string) => {
      state = applyCounterSnapshotToClientState(state, { version, capturedAt: payload.capturedAt, payload });
      setCounterSyncSnapshot(state.snapshot, { allowOfflineFallback: false });
      return rankDraftEntries([row], new Set<string>(), "", "Todos", {
        counterSnapshotVersion: state.version, mapModeId: "brawl-ball", enemyRows: [enemy],
        pickNumber: 4, baseHybridTop30Names: ["Bibi"],
      })[0];
    };
    const payload = createSnapshot();
    const before = calculate({ ...payload, relations: [] }, "counter-1");
    const after = calculate({ ...payload, capturedAt: "2026-09-07T00:00:00Z" }, "counter-2");
    expect(after.signal.counterMatchups.map(matchup => matchup.defender)).toContain("Surge");
    expect(after.draftScore).toBeGreaterThan(before.draftScore);
    expect(state.version).toBe("counter-2");

    // Inspect actual React dependencies so removing the version from Draft fails this regression.
    const file = ts.createSourceFile("Draft.tsx", readFileSync(new URL("../pages/Draft.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const dependencies = new Map<string, string[]>();
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(file) === "useMemo") {
        const deps = node.initializer.arguments[1];
        if (deps && ts.isArrayLiteralExpression(deps)) dependencies.set(node.name.text, deps.elements.map(dep => dep.getText(file)));
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(dependencies.get("baseRoleContext")).toContain("counterSnapshotVersion");
    expect(dependencies.get("counterWindow")).toContain("baseRoleContext");
    expect(dependencies.get("roleContext")).toContain("baseRoleContext");
    expect(dependencies.get("rankedDraftEntries")).toContain("roleContext");
    expect(dependencies.get("liveCounterSuggestions")).toContain("counterSnapshotVersion");
    expect(dependencies.get("coachAnalysis")).toContain("counterSnapshotVersion");
  });

  it("rejects malformed events before they can replace the active snapshot", () => {
    expect(() => parseCounterSnapshotEvent(JSON.stringify({ version: "bad" }))).toThrow(
      "Payload counter_snapshot inválido",
    );
  });
});
