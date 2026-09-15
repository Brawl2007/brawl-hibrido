import { describe, expect, it } from "vitest";
import { addCounterClient, addRankedClient, broadcastCounterSnapshot, broadcastRankedSnapshot, getCounterClientCount, getRankedClientCount } from "./realtime";
import type { CounterSyncSnapshotPayload } from "../shared/counterSyncSnapshot";
import type { RankedSnapshotEvent } from "../shared/rankedSyncSnapshot";
import { parseRankedSnapshotEvent } from "../shared/rankedSyncSnapshot";

describe("counter realtime broadcaster", () => {
  it("broadcasts a snapshot to connected clients and removes closed clients", () => {
    const writes: string[] = [];
    const response = { write: (chunk: string) => writes.push(chunk) } as never;
    const remove = addCounterClient(response);
    const payload = { schemaVersion: 2, capturedAt: "2026-09-06T00:00:00.000Z", sourceStates: {}, relations: [], absenceStreaks: {} } as CounterSyncSnapshotPayload;

    broadcastCounterSnapshot({ version: "counter-test", capturedAt: payload.capturedAt, payload });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("event: counter_snapshot");
    expect(writes[0]).toContain('"version":"counter-test"');
    remove();
    expect(getCounterClientCount()).toBe(0);
  });
});

describe("Ranked realtime broadcaster", () => {
  it("serializes the complete Ranked event and parses it as the client would", () => {
    const writes: string[] = [];
    const response = { write: (chunk: string) => writes.push(chunk) } as never;
    const remove = addRankedClient(response);
    const event: RankedSnapshotEvent = {
      version: "live-ranked-test",
      capturedAt: "2026-09-06T00:00:00.000Z",
      syncState: "success",
      nextRefreshAt: "2026-09-06T01:00:00.000Z",
      sourceStatus: { topBrawl: "success", brawlPlanet: "partial" },
      sourceNotes: "uma fonte parcial",
      rowCount: 1,
      payload: {
        rows: [{ map: "Beach Ball", mode: "Fute-Brawl", modeId: "brawl-ball", brawler: "Bibi", score: 91, tier: "S", usage: 12, winRate: 58 }],
        maps: [{ name: "Beach Ball", mode: "Fute-Brawl", modeId: "brawl-ball", brawlerCount: 1, topScore: 91, tiers: { S: 1, A: 0, B: 0 } }],
        mapTeams: [],
        updatedAt: "2026-09-06T00:00:00.000Z",
        sourceStatus: { topBrawl: "success", brawlPlanet: "partial" },
      },
    };

    broadcastRankedSnapshot(event);
    const data = writes[0].split("data: ")[1].split("\n")[0];
    const parsed = parseRankedSnapshotEvent(data);

    expect(writes[0]).toContain("event: ranked_snapshot");
    expect(parsed.version).toBe("live-ranked-test");
    expect(parsed.syncState).toBe("success");
    expect(parsed.nextRefreshAt).toBe("2026-09-06T01:00:00.000Z");
    expect(parsed.payload.rows[0].winRate).toBe(58);
    remove();
    expect(getRankedClientCount()).toBe(0);
  });
});
