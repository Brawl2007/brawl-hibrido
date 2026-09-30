import { afterEach, expect, it, vi } from "vitest";
vi.mock("./counterSync", () => ({ restoreBrawlScopeMatchupMatrices: vi.fn(async () => ({ views: 7, pairs: 100 })), syncCounterData: vi.fn() }));
vi.mock("./rankedSync", () => ({ syncRankedData: vi.fn() }));
vi.mock("./observedMatchCollection", () => ({ recolherSeForAltura: vi.fn() }));
vi.mock("./brawlStarsApi", () => ({ isOfficialApiConfigured: vi.fn(() => false), setRuntimeApiKey: vi.fn() }));
vi.mock("./ensureTables", () => ({ ensureTables: vi.fn(async () => {}) }));
vi.mock("./appSettings", () => ({ ensureAppSettingsTable: vi.fn(async () => {}), getStoredApiKey: vi.fn(async () => ({ key: null })) }));
import { startLiveSync, isLiveSyncEnabled } from "./liveSync";
import { restoreBrawlScopeMatchupMatrices, syncCounterData } from "./counterSync";
const original = process.env.BRAWL_LIVE_SYNC_ENABLED;
afterEach(() => { if (original === undefined) delete process.env.BRAWL_LIVE_SYNC_ENABLED; else process.env.BRAWL_LIVE_SYNC_ENABLED = original; vi.useRealTimers(); });
it("restores imported data but does not launch automatic collectors by default", async () => {
  process.env.BRAWL_RANKED_SYNC_ENABLED = "false";
  delete process.env.BRAWL_LIVE_SYNC_ENABLED; vi.useFakeTimers();
  expect(isLiveSyncEnabled()).toBe(false);
  const stop = startLiveSync();
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(restoreBrawlScopeMatchupMatrices).toHaveBeenCalledTimes(1);
  expect(syncCounterData).not.toHaveBeenCalled();
  stop();
  delete process.env.BRAWL_RANKED_SYNC_ENABLED;
});


it("refreshes ranked automatically without collecting counters", async () => {
  delete process.env.BRAWL_LIVE_SYNC_ENABLED;
  delete process.env.BRAWL_RANKED_SYNC_ENABLED;
  vi.useFakeTimers();
  const { syncRankedData } = await import("./rankedSync");
  vi.mocked(syncRankedData).mockResolvedValue({ ok: true } as Awaited<ReturnType<typeof syncRankedData>>);
  const stop = startLiveSync();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(syncRankedData).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(syncRankedData).toHaveBeenCalledTimes(2);
  expect(syncCounterData).not.toHaveBeenCalled();
  stop();
});
