import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import { calculateDraftSignal, getCounterProfile } from "@shared/draft";
import {
  COUNTER_PICK_MULTIPLIER_MAX,
  COUNTER_PICK_MULTIPLIER_MIN,
  defaultDraftRuleSettings,
  getCounterPickMultiplier,
  normalizeDraftRuleSettings,
} from "@shared/draftRules";
import { getMatchupValue } from "@shared/counterMatchupValue";

beforeEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));
afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: false }));

describe("ajuste de Counter separado por pick", () => {
  it("por omissão todos os picks valem a percentagem publicada", () => {
    for (const pick of [1, 2, 3, 4, 5, 6]) {
      expect(getCounterPickMultiplier(pick, defaultDraftRuleSettings)).toBe(1);
    }
  });

  it("lê o multiplicador do pick pedido, e não um valor único", () => {
    const rules = normalizeDraftRuleSettings({
      counterPickMultiplier1: 0.5,
      counterPickMultiplier2: 0.75,
      counterPickMultiplier3: 1,
      counterPickMultiplier4: 1.5,
      counterPickMultiplier5: 2,
      counterPickMultiplier6: 3,
    });

    expect([1, 2, 3, 4, 5, 6].map((pick) => getCounterPickMultiplier(pick, rules)))
      .toEqual([0.5, 0.75, 1, 1.5, 2, 3]);
    // Fora do intervalo vale o do primeiro pick, como no resto do motor.
    expect(getCounterPickMultiplier(0, rules)).toBe(0.5);
    expect(getCounterPickMultiplier(99, rules)).toBe(0.5);
    expect(getCounterPickMultiplier(undefined, rules)).toBe(0.5);
  });

  it("aplica o ajuste certo aos pontos de cada pick", () => {
    /**
     * A verificação que interessa: mudar o ajuste tem de mudar o Score, e na
     * proporção exata. Um controlo que só muda o texto no ecrã já foi motivo de
     * queixa neste projeto.
     */
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const alvo = getCounterProfile("Brock").counters.find((name) => getMatchupValue("Brock", name).total > 0)!;
    const inimigos = [{ brawler: alvo, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }];
    const delta = getMatchupValue("Brock", alvo).total;

    expect(alvo).toBeDefined();
    expect(delta).toBeGreaterThan(0);

    const rules = {
      counterPickMultiplier1: 0.5,
      counterPickMultiplier2: 1,
      counterPickMultiplier6: 3,
    };

    for (const [pick, esperado] of [[1, 0.5], [2, 1], [6, 3]] as const) {
      const signal = calculateDraftSignal(row, { enemyRows: inimigos, pickNumber: pick, ruleSettings: rules });
      expect(signal.scoreBreakdown.counterPickMultiplier).toBe(esperado);
      expect(signal.scoreBreakdown.counterPoints)
        .toBeCloseTo(signal.scoreBreakdown.hybridPoints * (delta / 100) * esperado, 6);
    }
  });

  it("triplicar um pick não mexe nos outros", () => {
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const alvo = getCounterProfile("Brock").counters.find((name) => getMatchupValue("Brock", name).total > 0)!;
    const inimigos = [{ brawler: alvo, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }];

    const base = calculateDraftSignal(row, { enemyRows: inimigos, pickNumber: 3 });
    const comPick6Triplicado = calculateDraftSignal(row, {
      enemyRows: inimigos,
      pickNumber: 3,
      ruleSettings: { counterPickMultiplier6: 3 },
    });

    expect(comPick6Triplicado.scoreBreakdown.counterPoints).toBeCloseTo(base.scoreBreakdown.counterPoints, 6);
  });

  it("herda o ajuste único antigo para os seis picks em vez de o perder", () => {
    /**
     * Quem tinha o Counter configurado em 2× antes desta mudança não pode voltar
     * silenciosamente a 1× só por o site ter sido atualizado.
     */
    const migrado = normalizeDraftRuleSettings({ counterPickMultiplier: 2 });

    expect([1, 2, 3, 4, 5, 6].map((pick) => getCounterPickMultiplier(pick, migrado)))
      .toEqual([2, 2, 2, 2, 2, 2]);
  });

  it("um valor próprio do pick ganha ao valor único herdado", () => {
    const misto = normalizeDraftRuleSettings({ counterPickMultiplier: 2, counterPickMultiplier1: 0.5 });

    expect(getCounterPickMultiplier(1, misto)).toBe(0.5);
    expect(getCounterPickMultiplier(2, misto)).toBe(2);
  });

  it("mantém cada ajuste dentro do intervalo permitido", () => {
    const extremos = normalizeDraftRuleSettings({ counterPickMultiplier1: 99, counterPickMultiplier2: -4 });

    expect(getCounterPickMultiplier(1, extremos)).toBe(COUNTER_PICK_MULTIPLIER_MAX);
    expect(getCounterPickMultiplier(2, extremos)).toBe(COUNTER_PICK_MULTIPLIER_MIN);
    // Valores inválidos caem no padrão em vez de contaminarem o Score.
    expect(getCounterPickMultiplier(3, normalizeDraftRuleSettings({ counterPickMultiplier3: Number.NaN }))).toBe(1);
  });

  it("as regras percentuais continuam a ser tratadas como percentagens", () => {
    // Os multiplicadores vão até 3; as percentagens continuam limitadas a 0–1.
    const rules = normalizeDraftRuleSettings({ counterPickMultiplier4: 2.5, sameClassPenalty: 4, missingMid: -1 });

    expect(rules.counterPickMultiplier4).toBe(2.5);
    expect(rules.sameClassPenalty).toBe(1);
    expect(rules.missingMid).toBe(0);
  });
});
