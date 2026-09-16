import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { brawlScopeCaptureSchema, brawlScopeCaptureFileSchema, reviewCaptureBatch, type BrawlScopeCapture } from "../shared/brawlScopeCapture";

// A fila de fichas tem tabela própria: `filas` faz de `brawlscope_captures`.
const db = vi.hoisted(() => ({ payload: "", persist: true, filas: new Map<string, { id: string; payload: string }>() }));
vi.mock("./db", () => ({
  getCounterSyncSnapshot: vi.fn(async () => ({ id: 1, payload: db.payload, version: "test" })),
  upsertCounterSyncSnapshot: vi.fn(async (snapshot) => { if (!db.persist) return undefined; db.payload = snapshot.payload; return snapshot; }),
  upsertBrawlScopeCaptures: vi.fn(async (rows: { id: string; payload: string }[]) => { for (const linha of rows) db.filas.set(linha.id, linha); return rows.length; }),
  listBrawlScopeCaptures: vi.fn(async () => Array.from(db.filas.values())),
}));
import { clearImportedBrawlScope, getBrawlScopeMatchupMatrix, getPublicCounterSyncSnapshot, getFilaDeFichasImportadas, importBrawlScopeCapture, persistCaptures, persistMatchupMatricesNow, restoreBrawlScopeMatchupMatrices, resetRestoreParaTestes, toPublicCounterSnapshotPayload } from "./counterSync";

const profile = (): BrawlScopeCapture => ({
  url: "https://brawlscope.com/counters/bibi", brawler: "Bibi", view: "overall", capturedAt: "2026-09-13T01:00:00.000Z", expectedCount: 3,
  rows: [
    { opponent: "Bea", rate: 52.2, average: 46.7, delta: 5.5 },
    { opponent: "Frank", rate: 49.3, average: 49.3, delta: 0 },
    { opponent: "Wendy", rate: 49.1, average: 59.6, delta: -10.5 },
  ], counteredBy: [{ brawler: "Bea", delta: 5.5 }], targets: [{ brawler: "Wendy", delta: -10.5 }], synergies: [{ brawler: "Amber", delta: 10.1 }],
});
beforeEach(() => { clearImportedBrawlScope(); resetRestoreParaTestes(); db.persist = true; db.filas.clear(); db.payload = JSON.stringify({ schemaVersion: 2, capturedAt: "2026-09-13", relations: [], sourceStates: {} }); });
describe("v54 capture integrity", () => {
  it("separates a damaged profile without changing the valid ones", () => {
    const bad = profile(); bad.rows[0].delta = 99;
    const result = reviewCaptureBatch({ format: "brawlhibrido-captures-v1", profiles: [profile(), bad] });
    expect(result.profiles).toEqual([profile()]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toContain("Ficha 2");
  });
  it("preserves overlap between literal lists on a small sample", () => {
    const p = profile(); p.targets = p.counteredBy;
    expect(brawlScopeCaptureSchema.parse(p)).toEqual(p);
  });
  it.skipIf(!process.env.BRAWL_CAPTURE_TEST_FILE)("validates, imports and restores the real exported batch unchanged", async () => {
    const input = JSON.parse(fs.readFileSync(process.env.BRAWL_CAPTURE_TEST_FILE!, "utf8"));
    const parsed = brawlScopeCaptureFileSchema.parse(input);
    expect(parsed.profiles).toEqual(input.profiles);
    for (const p of parsed.profiles) importBrawlScopeCapture(p);
    expect((await persistCaptures(parsed.profiles)).saved).toBe(true);
    expect((await persistMatchupMatricesNow()).saved).toBe(true);
    const saved = db.payload;
    clearImportedBrawlScope(); resetRestoreParaTestes(); db.payload = saved;
    await restoreBrawlScopeMatchupMatrices();
    for (const p of parsed.profiles) {
      expect(getBrawlScopeMatchupMatrix(p.view)?.[p.brawler]).toEqual(Object.fromEntries(p.rows.map(r => [r.opponent, r.delta])));
    }
    expect(Array.from(db.filas.values()).map(linha => JSON.parse(linha.payload))).toEqual(parsed.profiles);
  });
  it("preserves literal lists even when their deltas have the opposite sign", () => {
    const p = profile();
    p.counteredBy = [{ brawler: "Wendy", delta: -10.5 }];
    p.targets = [{ brawler: "Bea", delta: 5.5 }];
    expect(brawlScopeCaptureSchema.parse(p)).toEqual(p);
    importBrawlScopeCapture(p);
    expect(getBrawlScopeMatchupMatrix("overall")?.Bibi).toEqual({ Bea: 5.5, Frank: 0, Wendy: -10.5 });
  });
  it("preserves the published delta and zero without merging short names", () => {
    const p = profile(); p.rows[0] = { opponent: "Nita", rate: 58, average: 52.5, delta: 5.4 }; p.counteredBy = [{ brawler: "Nita", delta: 5.4 }];
    importBrawlScopeCapture(p);
    expect(getBrawlScopeMatchupMatrix("overall")?.Bibi).toEqual({ Nita: 5.4, Frank: 0, Wendy: -10.5 });
  });
  it.each([
    ["incomplete", (p: BrawlScopeCapture) => { p.expectedCount++; }],
    ["duplicate", (p: BrawlScopeCapture) => { p.rows[1] = p.rows[0]; }],
    ["wrong owner", (p: BrawlScopeCapture) => { p.brawler = "Lou"; }],
    ["wrong mode", (p: BrawlScopeCapture) => { p.view = "heist"; }],
    ["wrong rank", (p: BrawlScopeCapture) => { p.url += "?rank=all"; }],
    ["lookalike host", (p: BrawlScopeCapture) => { p.url = "https://evilbrawlscope.com/counters/bibi"; }],
    ["invalid URL", (p: BrawlScopeCapture) => { p.url = "not a URL"; }],
    ["bad delta", (p: BrawlScopeCapture) => { p.rows[0].delta = 20; }],
    ["duplicate in list", (p: BrawlScopeCapture) => { p.counteredBy.push(p.counteredBy[0]); }],
    ["list delta mismatch", (p: BrawlScopeCapture) => { p.counteredBy[0].delta = 5.4; }],
  ])("rejects %s before mutation", (_, mutate) => {
    const p = profile(); mutate(p);
    expect(brawlScopeCaptureSchema.safeParse(p).success).toBe(false);
    expect(() => importBrawlScopeCapture(p)).toThrow();
    expect(getBrawlScopeMatchupMatrix("overall")).toBeUndefined();
  });
  it("imports idempotently and preserves other modes and profiles", () => {
    importBrawlScopeCapture(profile());
    const second = { ...profile(), brawler: "Lou", url: "https://brawlscope.com/counters/lou?mode=heist", view: "heist" as const };
    importBrawlScopeCapture(second); importBrawlScopeCapture(profile());
    expect(Object.keys(getBrawlScopeMatchupMatrix("overall")!)).toEqual(["Bibi"]);
    expect(getBrawlScopeMatchupMatrix("heist")?.Lou).toBeDefined();
  });
  it("persists captures and preserves old matrix rows on restart", async () => {
    importBrawlScopeCapture(profile());
    expect((await persistCaptures([profile()])).saved).toBe(true);
    expect((await persistMatchupMatricesNow()).saved).toBe(true);
    const saved = db.payload;
    clearImportedBrawlScope(); resetRestoreParaTestes(); db.payload = saved;
    await restoreBrawlScopeMatchupMatrices();
    expect(getBrawlScopeMatchupMatrix("overall")?.Bibi.Wendy).toBe(-10.5);
    // A ficha completa — sinergias incluídas — sobrevive na sua própria linha.
    expect(JSON.parse(db.filas.get("overall:Bibi")!.payload).synergies).toEqual([{ brawler: "Amber", delta: 10.1 }]);
    // E deixou de pesar na snapshot, que é o que fazia a gravação rebentar.
    await persistMatchupMatricesNow();
    expect(JSON.parse(db.payload)).not.toHaveProperty("browserCaptures");
    expect(toPublicCounterSnapshotPayload(JSON.parse(db.payload))).not.toHaveProperty("browserCaptures");
  });
  it("restores saved captures even when matrices were restored first", async () => {
    importBrawlScopeCapture(profile());
    await persistCaptures([profile()]);
    await persistMatchupMatricesNow();
    const saved = db.payload;
    const fila = new Map(db.filas);

    // Primeiro arranque: a matriz está gravada, a fila ainda não chegou.
    clearImportedBrawlScope(); resetRestoreParaTestes();
    db.filas.clear(); db.payload = saved;
    await restoreBrawlScopeMatchupMatrices();

    // A fila aparece a seguir: tem de ser recuperada à mesma, ou o botão
    // Publicar não encontra as fichas que estão guardadas.
    resetRestoreParaTestes();
    db.filas = fila;
    await restoreBrawlScopeMatchupMatrices();
    expect(getFilaDeFichasImportadas()).toEqual([profile()]);
  });

  /**
   * Quem já tinha fila guardada dentro da snapshot não a pode perder na
   * atualização: a recuperação lê-a de lá e passa-a para a tabela.
   */
  it("migrates a queue stored inside the old snapshot payload", async () => {
    const antiga = JSON.parse(db.payload);
    antiga.browserCaptures = [profile()];
    db.payload = JSON.stringify(antiga);
    clearImportedBrawlScope(); resetRestoreParaTestes();
    await restoreBrawlScopeMatchupMatrices();
    expect(getBrawlScopeMatchupMatrix("overall")?.Bibi.Wendy).toBe(-10.5);
    expect(getFilaDeFichasImportadas()).toEqual([profile()]);
    expect(JSON.parse(db.filas.get("overall:Bibi")!.payload)).toEqual(profile());
  });
  it("does not report persistence when the database returns no snapshot", async () => {
    importBrawlScopeCapture(profile()); db.persist = false;
    expect((await persistMatchupMatricesNow()).saved).toBe(false);
  });
  it("does not expose a raw technical payload as a source note", async () => {
    const payload = JSON.parse(db.payload);
    payload.sourceStates = { brawlscope: { status: "failed", complete: false, fetchedAt: "2026-09-13", brawlers: [], relationCount: 0, note: JSON.stringify(Array.from({ length: 200 }, () => ({ owner: "Jacky", attacker: "Mortis" }))) } };
    db.payload = JSON.stringify(payload);
    expect((await getPublicCounterSyncSnapshot())?.payload.sourceStates.brawlscope.note).toContain("detalhe técnico muito extenso");
  });
});
