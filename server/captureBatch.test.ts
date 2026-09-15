import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./counterSync", () => ({ restoreBrawlScopeMatchupMatrices: vi.fn(async () => ({})), importBrawlScopeCapture: vi.fn(() => ({ ok: true })), persistMatchupMatricesNow: vi.fn(async () => ({ saved: true })) }));
import { importBrawlScopeCapture, persistMatchupMatricesNow } from "./counterSync";
import { saveCaptureBatch } from "./captureBatch";
const profile = { url: "https://brawlscope.com/counters/nori", brawler: "Nori", view: "overall", capturedAt: "2026-09-14T00:00:00.000Z", expectedCount: 1, rows: [{ opponent: "Doug", rate: 50, average: 50, delta: 0 }], counteredBy: [], targets: [], synergies: [] };
beforeEach(() => vi.clearAllMocks());
it("validates 20 captures and confirms them after one durable write", async () => {
  expect(await saveCaptureBatch(Array.from({ length: 20 }, () => profile))).toEqual({ ok: true, persisted: true, confirmed: 20 });
  expect(importBrawlScopeCapture).toHaveBeenCalledTimes(20);
  expect(persistMatchupMatricesNow).toHaveBeenCalledTimes(1);
});
it("validates the whole group before mutation", async () => {
  await expect(saveCaptureBatch([profile, { ...profile, view: "wrong" }])).rejects.toThrow();
  expect(importBrawlScopeCapture).not.toHaveBeenCalled();
  expect(persistMatchupMatricesNow).not.toHaveBeenCalled();
});
it("does not confirm a group when persistence fails", async () => {
  vi.mocked(persistMatchupMatricesNow).mockResolvedValueOnce({ saved: false });
  await expect(saveCaptureBatch([profile])).rejects.toThrow("não confirmada");
});
