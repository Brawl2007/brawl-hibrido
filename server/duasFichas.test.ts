import { afterEach, describe, expect, it } from "vitest";
import { definirLeituraDasDuasFichas, getMatchupValue, leituraDasDuasFichas } from "@shared/counterMatchupValue";
import { calculateDraftSignal, rankDraftEntries } from "@shared/draft";
import { defaultDraftRuleSettings } from "@shared/draftRules";
import { brawlScopeMatchupDeltas } from "@shared/brawlScopeMatchupDeltas.generated";

/**
 * v153 — o caso que levou a isto: Quick Travel, bans Amber/Ash/Shade/Wendy,
 * inimigos Surge, Emz e Griff, aliados Bull e Colette. O Metapick punha a Lumi
 * em 1.º e o site em 63.º. A ficha da Lumi dizia −12,7% contra os três; as
 * fichas dos três diziam −0,2%. Lendo só uma ficha, o site ficava com a pior.
 */
const row = (brawler: string) => ({ brawler, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 });
const fichas = brawlScopeMatchupDeltas as Record<string, { deltas: Record<string, number> }>;

describe("média das duas fichas do confronto", () => {
  afterEach(() => definirLeituraDasDuasFichas(true));

  it("vem ligada por omissão", () => {
    expect(defaultDraftRuleSettings.lerAsDuasFichas).toBe(1);
    expect(leituraDasDuasFichas()).toBe(true);
  });

  it("cada par vale a média da ficha do candidato e da ficha do adversário", () => {
    for (const inimigo of ["Surge", "Emz", "Griff"]) {
      const daLumi = -fichas.Lumi.deltas[inimigo];
      const doInimigo = fichas[inimigo].deltas.Lumi;
      expect(getMatchupValue("Lumi", inimigo).base).toBeCloseTo((daLumi + doInimigo) / 2, 1);
    }
  });

  it("desligada, volta a valer só a ficha do candidato", () => {
    definirLeituraDasDuasFichas(false);
    expect(getMatchupValue("Lumi", "Surge").base).toBeCloseTo(-fichas.Lumi.deltas.Surge, 5);
  });

  it("o par fica coerente dos dois lados: se A ganha a B, B perde com A", () => {
    for (const [a, b] of [["Lumi", "Surge"], ["El Primo", "Emz"], ["Wendy", "Shade"], ["Colt", "Bull"]]) {
      const ab = getMatchupValue(a, b).base ?? 0;
      const ba = getMatchupValue(b, a).base ?? 0;
      expect(ab).toBeCloseTo(-ba, 1);
    }
  });

  it("no draft do Quick Travel a Lumi perde muito menos pontos do que só com a ficha dela", () => {
    const contexto = { enemyRows: [row("Surge"), row("Emz"), row("Griff")], allyRows: [row("Bull"), row("Colette")], pickNumber: 6 };
    const comAMedia = calculateDraftSignal(row("Lumi"), contexto).scoreBreakdown.counterPoints;
    definirLeituraDasDuasFichas(false);
    const soADela = calculateDraftSignal(row("Lumi"), contexto).scoreBreakdown.counterPoints;
    expect(soADela).toBeLessThan(comAMedia);
    expect(Math.abs(comAMedia)).toBeLessThan(Math.abs(soADela) * 0.7);
  });

  it("a regra do painel chega ao motor e é respeitada", () => {
    const linhas = [row("Lumi"), row("Surge")];
    rankDraftEntries(linhas, new Set(), "", "Todos", { ruleSettings: { ...defaultDraftRuleSettings, lerAsDuasFichas: 0 } });
    expect(leituraDasDuasFichas()).toBe(false);
    rankDraftEntries(linhas, new Set(), "", "Todos", { ruleSettings: { ...defaultDraftRuleSettings, lerAsDuasFichas: 1 } });
    expect(leituraDasDuasFichas()).toBe(true);
    // Sem a regra dita, não mexe no que o painel escolheu.
    definirLeituraDasDuasFichas(false);
    rankDraftEntries(linhas, new Set(), "", "Todos", {});
    expect(leituraDasDuasFichas()).toBe(false);
  });
});
