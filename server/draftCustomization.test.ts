import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateDraftSignal, inferDraftRole } from "../shared/draft";
import { setDraftRoleOverrides } from "../shared/draftRoleOverrides";
import { setCounterSyncSnapshot } from "../shared/counterSourceRelations";
import type { CounterSyncSnapshotPayload, SyncedCounterRelation } from "../shared/counterSyncSnapshot";
const storage = vi.hoisted(() => new Map<string, string | null>());
vi.mock("./appSettings", () => ({ getSetting: vi.fn(async (key: string) => storage.get(key) ?? null), setSetting: vi.fn(async (key: string, value: string) => { storage.set(key, value); }) }));
import { readDraftRoles, saveDraftRole } from "./draftRoleSettings";
import { setSetting } from "./appSettings";
afterEach(() => { setDraftRoleOverrides({}); setCounterSyncSnapshot(undefined, { allowOfflineFallback: false }); storage.clear(); vi.clearAllMocks(); });
const row = { brawler: "Brock", score: 70, tier: "A" as const };
function snapshot(relations: SyncedCounterRelation[]) {
  setCounterSyncSnapshot({ schemaVersion: 2, capturedAt: new Date().toISOString(), sourceStates: {}, relations } as CounterSyncSnapshotPayload, { allowOfflineFallback: false });
}
const relation = (source: "brawlscope" | "prodigy", foe: string, direction: "counteredBy" | "targets" = "counteredBy"): SyncedCounterRelation => ({ owner: "Brock", direction, attacker: direction === "counteredBy" ? foe : "Brock", defender: direction === "counteredBy" ? "Brock" : foe, source, sourceUrl: "https://example.com" });
describe("customização do Draft", () => {
  it("corrige os quatro padrões e aplica a edição no cálculo de função", () => {
    for (const name of ["Shade", "Melodie", "Cordelius"]) expect(inferDraftRole(name)).toBe("side");
    expect(inferDraftRole("Rico")).toBe("flex");
    const candidate = { ...row, brawler: "Shade" };
    const before = calculateDraftSignal(candidate, { role: "mid" });
    setDraftRoleOverrides({ Shade: "mid" });
    expect(inferDraftRole("Shade")).toBe("mid");
    const after = calculateDraftSignal(candidate, { role: "mid" });
    expect(after.fit).not.toBe(before.fit);
    setDraftRoleOverrides({});
    expect(inferDraftRole("Shade")).toBe("side");
  });
  it("guarda edições concorrentes, restaura após leitura e repõe padrão", async () => {
    await Promise.all([saveDraftRole("Shade", "mid"), saveDraftRole("Rico", "side")]);
    setDraftRoleOverrides({});
    await readDraftRoles();
    expect(inferDraftRole("Shade")).toBe("mid");
    expect(inferDraftRole("Rico")).toBe("side");
    await saveDraftRole("Shade", null);
    expect(inferDraftRole("Shade")).toBe("side");
    expect(inferDraftRole("Rico")).toBe("side");
  });
  it("não aplica uma edição cuja gravação falhou", async () => {
    vi.mocked(setSetting).mockRejectedValueOnce(new Error("DB indisponível"));
    await expect(saveDraftRole("Shade", "mid")).rejects.toThrow("DB indisponível");
    expect(inferDraftRole("Shade")).toBe("side");
  });
  it("PL Prodigy dá bônus mesmo quando existe perfil BrawlScope", () => {
    snapshot([relation("brawlscope", "Piper"), relation("prodigy", "Mortis")]);
    const signal = calculateDraftSignal(row, { bannedNames: ["Mortis"], baseHybridTop25Names: ["Mortis"] });
    expect(signal.bonusSources.bannedCounters).toEqual(["Mortis"]);
    expect(signal.scoreBreakdown.banPoints).toBeGreaterThan(0);
  });
  it("BrawlScope dá bônus e duas confirmações não duplicam o mesmo ban", () => {
    snapshot([relation("brawlscope", "Mortis"), relation("prodigy", "Mortis")]);
    const signal = calculateDraftSignal(row, { bannedNames: ["Mortis", "Mortis"], baseHybridTop25Names: ["Mortis"] });
    expect(signal.bannedCounterCount).toBe(1);
    expect(signal.scoreBreakdown.banPoints).toBeGreaterThan(0);
  });
  it("não inverte targets e mantém a condição Top 25", () => {
    snapshot([relation("brawlscope", "Piper", "targets"), relation("prodigy", "Mortis")]);
    const signal = calculateDraftSignal(row, { bannedNames: ["Piper", "Mortis"], baseHybridTop25Names: ["Piper"] });
    expect(signal.bannedCounterCount).toBe(0);
    expect(signal.scoreBreakdown.banPoints).toBe(0);
  });
});
