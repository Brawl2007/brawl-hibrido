import { describe, expect, it } from "vitest";
import { buildGamePlanText } from "@shared/coachPlan";
import { analyzeDraftComposition, estimateDraftWinProbability } from "@shared/draft";

describe("coach game plan export", () => {
  it("builds a complete copyable plan with context and tactical phases", () => {
    const picks = [
      { brawler: "Bibi" },
      { brawler: "Belle" },
    ];
    const analysis = analyzeDraftComposition(picks, [{ brawler: "Mortis" }], "brawl-ball");
    const text = buildGamePlanText("Center Stage", "brawl-ball", "blue", analysis, picks);

    expect(text).toContain("BRAWL HÍBRIDO — COACH GAME PLAN");
    expect(text).toContain("Mapa: Center Stage");
    expect(text).toContain("Modo: brawl-ball");
    expect(text).toContain("Perspetiva: Equipa Azul");
    expect(text).toContain("WIN CONDITION:");
    expect(text).toContain("ABERTURA:");
    expect(text).toContain("MEIO DE JOGO:");
    expect(text).toContain("FECHO:");
    expect(text).toContain("Bibi");
    expect(text).toContain("Build: Gadget");
  });

  it("exports final probability and tactical advice when the enemy draft is known", () => {
    const picks = [{ brawler: "Willow" }];
    const enemies = [{ brawler: "Spike" }];
    const analysis = analyzeDraftComposition(picks, enemies, "gem-grab");
    const estimate = estimateDraftWinProbability(picks.map((row) => ({ ...row, score: 82, tier: "S" as const, brawlPlanetWinRate: 60 })), enemies.map((row) => ({ ...row, score: 60, tier: "B" as const, brawlPlanetWinRate: 45 })));
    const text = buildGamePlanText("Hard Rock Mine", "gem-grab", "blue", analysis, picks, estimate, enemies);

    expect(text).toContain("ESTIMATIVA FINAL: Azul");
  });

  it("keeps an explicit empty-picks state instead of producing an empty file", () => {
    const analysis = analyzeDraftComposition([], [], "heist");
    const text = buildGamePlanText(undefined, "heist", "red", analysis, []);
    expect(text).toContain("Mapa: Não selecionado");
    expect(text).toContain("Perspetiva: Equipa Vermelha");
    expect(text).toContain("Ainda sem picks aliados.");
  });
});
