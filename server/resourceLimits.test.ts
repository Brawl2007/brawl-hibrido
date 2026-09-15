import { expect, it, vi } from "vitest";
import { mapLimited } from "./concurrency";
import { addCounterClient, broadcastCounterSnapshot, getCounterClientCount } from "./realtime";
import type { CounterSyncSnapshotPayload } from "../shared/counterSyncSnapshot";
it("caps parallel work while processing every item in input order", async () => {
  let active = 0, maximum = 0;
  const output = await mapLimited(Array.from({ length: 26 }, (_, i) => i), 2, async n => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, n % 2));
    active--; return n * 2;
  });
  expect(maximum).toBe(2);
  expect(output).toEqual(Array.from({ length: 26 }, (_, i) => i * 2));
});
it("disconnects stalled SSE clients instead of accumulating more snapshots", () => {
  const response = { writableLength: 3 * 1024 * 1024, destroyed: false, destroy: vi.fn(), write: vi.fn() };
  addCounterClient(response as never);
  broadcastCounterSnapshot({ version: "test", capturedAt: "now", payload: {} as CounterSyncSnapshotPayload });
  expect(response.write).not.toHaveBeenCalled();
  expect(response.destroy).toHaveBeenCalledTimes(1);
  expect(getCounterClientCount()).toBe(0);
});
