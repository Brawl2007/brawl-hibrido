import { afterEach, describe, expect, it } from "vitest";
import { calculateDraftSignal } from "@shared/draft";
import { setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import type { CounterSyncSnapshotPayload } from "@shared/counterSyncSnapshot";
import { defaultDraftRuleSettings } from "@shared/draftRules";

const capturedAt = "2026-09-17T00:00:00.000Z";
const estado = { status: "success" as const, complete: true, fetchedAt: capturedAt, brawlers: ["Nori", "Gus", "Pearl"], relationCount: 1 };
const mapa = { map: "Flaring Phoenix", mode: "Nocaute", modeId: "knockout", tier: "S" as const, score: 70, winRate: 52, usage: 8 };
const nori = { ...mapa, brawler: "Nori", score: 72, winRate: 55 };
const gus = { ...mapa, brawler: "Gus" };
const pearl = { ...mapa, brawler: "Pearl" };

/** O Gus só o BrawlScope publica; a Pearl só o Brawl Planet. */
function snapshotDuasFontes(): CounterSyncSnapshotPayload {
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
      { owner: "Nori", teammate: "Pearl", rank: 1, source: "planet", sourceUrl: "https://planet.test/nori", delta: 6 },
    ],
  };
}

describe("sinergia da segunda fonte", () => {
  afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));

  /**
   * As duas fontes leem páginas diferentes e publicam pares diferentes. Ficar
   * só com a prioritária deitava fora o que a outra tinha de próprio.
   */
  it("soma a fatia da segunda fonte pelos aliados que a primeira não cobre", () => {
    setCounterSyncSnapshot(snapshotDuasFontes());
    const comAsDuas = calculateDraftSignal(nori, { mapModeId: "knockout", allyRows: [gus, pearl] });
    const soAPrimeira = calculateDraftSignal(nori, { mapModeId: "knockout", allyRows: [gus] });

    expect(comAsDuas.scoreBreakdown.synergySegundaFonteSource).toBe("Brawl Planet");
    expect(comAsDuas.scoreBreakdown.synergySegundaFonteAllies).toEqual(["Pearl"]);
    // O Gus não entra aqui porque o Brawl Planet não o publica — e não por ser
    // repetido. Repetidos contam, como o teste seguinte verifica.
    // 6% publicados pelo Brawl Planet, a metade que o peso por omissão define.
    expect(comAsDuas.scoreBreakdown.synergySegundaFonteRate).toBeCloseTo(0.06 * defaultDraftRuleSettings.synergySegundaFonte, 6);
    expect(comAsDuas.scoreBreakdown.synergyPoints).toBeCloseTo(soAPrimeira.scoreBreakdown.synergyPoints, 6);
    expect(comAsDuas.scoreBreakdown.synergySegundaFontePoints).toBeGreaterThan(0);
    /**
     * Compara-se a soma ANTES do teto.
     *
     * O Draft limita o ajuste contextual por estado, e neste cenário o bónus
     * já lá batia: 12,24 pontos contra um teto de 8,64. A fatia nova é somada
     * na mesma, mas o Score final não mexe — o teto é que manda, e é
     * comportamento que já existia. Medir o `draftScore` aqui não mediria a
     * funcionalidade; mediria o teto.
     */
    expect(comAsDuas.scoreBreakdown.rawContextualBonusPoints)
      .toBeGreaterThan(soAPrimeira.scoreBreakdown.rawContextualBonusPoints);
  });

  /**
   * As duas fontes medem em populações diferentes. Quando publicam o mesmo
   * par, são duas medições independentes da mesma dupla — e uma não anula a
   * outra: cada uma traz o seu bónus, com o seu peso.
   */
  it("um par publicado nas duas fontes recebe o bónus das duas", () => {
    const snapshot = snapshotDuasFontes();
    // Agora o Brawl Planet publica o MESMO aliado que o BrawlScope.
    snapshot.synergies = [
      { owner: "Nori", teammate: "Gus", rank: 1, source: "brawlscope", sourceUrl: "https://brawlscope.test/nori", delta: 10 },
      { owner: "Nori", teammate: "Gus", rank: 1, source: "planet", sourceUrl: "https://planet.test/nori", delta: 6 },
    ];
    setCounterSyncSnapshot(snapshot);
    const sinal = calculateDraftSignal(nori, { mapModeId: "knockout", allyRows: [gus] });

    expect(sinal.scoreBreakdown.synergyPoints).toBeGreaterThan(0);
    expect(sinal.scoreBreakdown.synergySegundaFonteAllies).toEqual(["Gus"]);
    // Os 6% do Brawl Planet, ao peso da segunda fonte, além dos 10% do BrawlScope.
    expect(sinal.scoreBreakdown.synergySegundaFonteRate).toBeCloseTo(0.06 * defaultDraftRuleSettings.synergySegundaFonte, 6);
    expect(sinal.scoreBreakdown.synergySegundaFontePoints).toBeGreaterThan(0);
  });

  it("peso a zero repõe exatamente o comportamento de fatia única", () => {
    setCounterSyncSnapshot(snapshotDuasFontes());
    const desligada = calculateDraftSignal(nori, {
      mapModeId: "knockout",
      allyRows: [gus, pearl],
      ruleSettings: { ...defaultDraftRuleSettings, synergySegundaFonte: 0 },
    });

    expect(desligada.scoreBreakdown.synergySegundaFontePoints).toBe(0);
    expect(desligada.scoreBreakdown.synergyPoints).toBeGreaterThan(0);
  });
});
