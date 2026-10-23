import { afterEach, describe, expect, it } from "vitest";
import { calculateDraftSignal } from "@shared/draft";
import { setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import type { CounterSyncSnapshotPayload } from "@shared/counterSyncSnapshot";

const capturedAt = "2026-09-17T00:00:00.000Z";
const estado = { status: "success" as const, complete: true, fetchedAt: capturedAt, brawlers: ["Nori", "Gus", "Pearl"], relationCount: 1 };
const mapa = { map: "Flaring Phoenix", mode: "Nocaute", modeId: "knockout", tier: "S" as const, score: 70, winRate: 52, usage: 8 };
const nori = { ...mapa, brawler: "Nori", score: 72, winRate: 55 };
const gus = { ...mapa, brawler: "Gus" };
const pearl = { ...mapa, brawler: "Pearl" };

/** As duas fontes publicam a MESMA dupla, Nori + Gus. */
function snapshotMesmaDupla(): CounterSyncSnapshotPayload {
  return {
    schemaVersion: 2,
    capturedAt,
    absenceStreaks: {},
    activeBrawlers: ["Nori", "Gus", "Pearl"],
    sourceStates: { brawlscope: estado, calculator: estado, planet: estado, prodigy: estado },
    relations: [
      { owner: "Nori", direction: "targets", attacker: "Nori", defender: "Gus", source: "brawlscope", sourceUrl: "https://brawlscope.test/nori" },
      { owner: "Nori", direction: "targets", attacker: "Nori", defender: "Pearl", source: "planet", sourceUrl: "https://planet.test/nori" },
    ],
    synergies: [
      { owner: "Nori", teammate: "Gus", rank: 1, source: "brawlscope", sourceUrl: "https://brawlscope.test/nori", delta: 10 },
      { owner: "Nori", teammate: "Gus", rank: 1, source: "planet", sourceUrl: "https://planet.test/nori", delta: 6 },
    ],
  };
}

describe("dupla e trio são coisas diferentes", () => {
  afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));

  /**
   * As duas fontes medem A MESMA COISA: a dupla. Somá-las seria contar duas
   * vezes a mesma observação, só porque duas páginas a publicaram. Conta a
   * fonte com prioridade — BrawlScope à frente do Brawl Planet.
   */
  it("a dupla conta uma vez, pela fonte prioritária", () => {
    setCounterSyncSnapshot(snapshotMesmaDupla());
    const sinal = calculateDraftSignal(nori, { mapModeId: "knockout", pickNumber: 2, allyRows: [gus] });

    expect(sinal.bonusSources.synergySource).toBe("BrawlScope");
    // Os 10% do BrawlScope, e não 10% + 6%.
    expect(sinal.scoreBreakdown.synergyBonusRate).toBeDefined();
    expect(sinal.scoreBreakdown.synergyPoints).toBeCloseTo(sinal.scoreBreakdown.hybridPoints * 0.10, 6);
  });

  /**
   * O trio mede OUTRA coisa: a composição naquele mapa, e não a dupla em
   * geral. Por isso soma, em vez de substituir.
   */
  it("o trio soma à dupla, em vez de a apagar", () => {
    setCounterSyncSnapshot(snapshotMesmaDupla());
    const composicao = [{ map: "Flaring Phoenix", brawlers: ["Nori", "Gus", "Pearl"], winRate: 58, sourceUrl: "https://planet.test/mapa" }];
    const sinal = calculateDraftSignal(nori, {
      mapModeId: "knockout", mapName: "Flaring Phoenix", pickNumber: 2, allyRows: [gus, pearl], mapTeams: composicao as never,
      // v168: a equipa tripla vem desligada; este teste mede-a, por isso liga-a.
      ruleSettings: { sinergiaDeEquipaTripla: 1 },
    });

    expect(sinal.scoreBreakdown.mapTeamSynergyPoints).toBeGreaterThan(0);
    expect(sinal.scoreBreakdown.synergyPoints).toBeGreaterThan(0);
  });
});
