import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./counterSync", () => ({ restoreBrawlScopeMatchupMatrices: vi.fn(async () => ({})), importBrawlScopeCapture: vi.fn(() => ({ ok: true })), persistCaptures: vi.fn(async (fichas: readonly unknown[]) => ({ saved: true, confirmed: fichas.length })) }));
import { importBrawlScopeCapture, persistCaptures } from "./counterSync";
import { saveCaptureBatch } from "./captureBatch";
const profile = { url: "https://brawlscope.com/counters/nori", brawler: "Nori", view: "overall", capturedAt: "2026-09-14T00:00:00.000Z", expectedCount: 1, rows: [{ opponent: "Doug", rate: 50, average: 50, delta: 0 }], counteredBy: [], targets: [], synergies: [] };
beforeEach(() => vi.clearAllMocks());
it("validates 20 captures and confirms them after one durable write", async () => {
  expect(await saveCaptureBatch(Array.from({ length: 20 }, () => profile))).toEqual({ ok: true, persisted: true, confirmed: 20 });
  expect(importBrawlScopeCapture).toHaveBeenCalledTimes(20);
  expect(persistCaptures).toHaveBeenCalledTimes(1);
});

/**
 * A regressão que fazia a importação falhar perto do fim.
 *
 * Um grupo gravava a fila INTEIRA — todas as fichas anteriores incluídas — e o
 * custo de confirmar vinte fichas crescia com o número de fichas já guardadas.
 * Às setecentas, a gravação passava dos cinco megabytes e rebentava.
 *
 * O que este teste fixa é a propriedade que impede isso de voltar: a gravação
 * de um grupo leva as fichas DESSE grupo, e mais nenhuma.
 */
it("only writes the captures of its own group", async () => {
  await saveCaptureBatch(Array.from({ length: 20 }, () => profile));
  expect(vi.mocked(persistCaptures).mock.calls[0][0]).toHaveLength(20);
});
it("validates the whole group before mutation", async () => {
  await expect(saveCaptureBatch([profile, { ...profile, view: "wrong" }])).rejects.toThrow();
  expect(importBrawlScopeCapture).not.toHaveBeenCalled();
  expect(persistCaptures).not.toHaveBeenCalled();
});
it("does not confirm a group when persistence fails", async () => {
  vi.mocked(persistCaptures).mockResolvedValueOnce({ saved: false, confirmed: 0 });
  await expect(saveCaptureBatch([profile])).rejects.toThrow("não confirmada");
});
