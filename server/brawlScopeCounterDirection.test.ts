import { afterEach, beforeEach, describe, expect, it, beforeAll, afterAll } from "vitest";
import { getBrawlScopeCoverage, getMatchupValue, getPublishedMatchupValue, toOwnerPerspective } from "@shared/counterMatchupValue";
import { getCounterSourceProfiles, setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import { brawlScopeCounterData } from "@shared/brawlScopeCounterData";
import { calculateDraftSignal } from "@shared/draft";
import { counterPickMultiplierOptions, defaultDraftRuleSettings, normalizeDraftRuleSettings } from "@shared/draftRules";
import { definirLeituraDasDuasFichas as definirFichasDoFicheiro } from "@shared/counterMatchupValue";

// Este ficheiro prova a leitura de uma só ficha (a do candidato), a regra de
// antes da v153. A média das duas fichas tem os testes em `duasFichas.test.ts`.
beforeAll(() => definirFichasDoFicheiro(false));
afterAll(() => definirFichasDoFicheiro(true));

// Auditoria dos catálogos estáticos; produção continua a exigir snapshot live.
beforeEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));
afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: false }));

const row = (brawler: string) => ({ brawler, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 });

describe("orientação do delta BrawlScope", () => {
  it("converte o valor publicado, que é a vantagem do adversário", () => {
    expect(toOwnerPerspective(11.6)).toBe(-11.6);
    expect(toOwnerPerspective(-9.8)).toBe(9.8);
  });

  it("lê cada confronto na perspetiva do brawler escolhido", () => {
    // Página pública de Nori: "Counter with · Doug"; "Punishes · Mico".
    expect(getMatchupValue("Nori", "Doug").total).toBeLessThan(0);
    expect(getMatchupValue("Nori", "Mico").total).toBeGreaterThan(0);
    expect(getMatchupValue("8-Bit", "Barley").total).toBeLessThan(0);
    expect(getMatchupValue("8-Bit", "Darryl").total).toBeGreaterThan(0);
  });

  it("penaliza enfrentar o próprio counter e premeia enfrentar uma presa", () => {
    expect(calculateDraftSignal(row("Nori"), { enemyRows: [row("Doug")] }).scoreBreakdown.counterPoints).toBeLessThan(0);
    expect(calculateDraftSignal(row("Nori"), { enemyRows: [row("Mico")] }).scoreBreakdown.counterPoints).toBeGreaterThan(0);
  });

  it("guarda as duas listas na orientação publicada, sem exceções", () => {
    expect(brawlScopeCounterData.nori.counteredBy).toContain("Doug");
    expect(brawlScopeCounterData.nori.targets).toContain("Mico");
    const profile = getCounterSourceProfiles("Nori").find((entry) => entry.source === "BrawlScope");
    expect(profile?.counteredBy.map((relation) => relation.brawler)).toEqual(brawlScopeCounterData.nori.counteredBy);
  });
});

describe("fichas que se contradizem", () => {
  it("dá a última palavra à ficha do brawler avaliado", () => {
    // A fonte mede cada par contra a média do adversário, por isso dois brawlers
    // dominantes aparecem a punir-se um ao outro, cada um na sua própria página.
    expect(getMatchupValue("Wendy", "Shade").total).toBeGreaterThan(0);
    expect(getMatchupValue("Shade", "Wendy").total).toBeGreaterThan(0);
  });

  it("não inventa counters para um brawler sem counters publicados", () => {
    const roster = Object.keys(brawlScopeCounterData);
    const counteram = (alvo: string) => roster
      .map((slug) => brawlScopeCounterData[slug])
      .filter(Boolean).length && roster.filter((slug) => slug !== alvo);

    expect(getBrawlScopeCoverage("Wendy").counters).toBe(0);
    expect(counteram("wendy") ? brawlScopeCounterData.wendy.counteredBy : []).toEqual([]);
    // Nenhum adversário do catálogo consegue um valor negativo contra a Wendy.
    const negativos = Object.keys(brawlScopeCounterData)
      .map((slug) => brawlScopeCounterData[slug])
      .filter(Boolean)
      .flatMap((entry) => entry.counteredBy)
      .filter((nome) => getMatchupValue("Wendy", nome).total < 0);
    expect(negativos).toEqual([]);
  });

  it("mantém os counters de quem os tem publicados", () => {
    expect(getMatchupValue("Crow", "Mr. P").total).toBeLessThan(0);
    expect(getMatchupValue("Nori", "Doug").total).toBeLessThan(0);
  });
});

describe("orientação publicada na ficha do brawler", () => {
  it("devolve o mesmo sinal que a fonte mostra no perfil", () => {
    // Na ficha de Nori: "Counter with · Doug" é positivo; "Punishes · Mico" é negativo.
    expect(getPublishedMatchupValue("Nori", "Doug").total).toBeGreaterThan(0);
    expect(getPublishedMatchupValue("Nori", "Mico").total).toBeLessThan(0);
  });

  it("mantém a perspetiva do candidato no motor do Draft", () => {
    const published = getPublishedMatchupValue("Nori", "Doug");
    const engine = getMatchupValue("Nori", "Doug");

    expect(published.total).toBe(-engine.total);
    expect(published.base).toBe(engine.base === null ? null : -engine.base);
  });
});

describe("counter banido", () => {
  const top25 = ["Shade", "R-T", "Nori"];
  const context = { bannedNames: top25.slice(0, 1), baseHybridTop25Names: top25, baseHybridTop30Names: top25, pickNumber: 1 };

  it("ignora um ban que não é counter literal do brawler", () => {
    const signal = calculateDraftSignal(row("Edgar"), context);

    expect(brawlScopeCounterData.edgar.counteredBy).not.toContain("Shade");
    expect(signal.bonusSources.bannedCounters).toEqual([]);
    expect(signal.bonusSources.nonTop25BannedCounters).toEqual([]);
    expect(signal.scoreBreakdown.banPoints).toBe(0);
    expect(signal.reasons.join(" ")).not.toContain("Shade");
  });

  it("mantém o bónus quando o ban remove um counter publicado", () => {
    const signal = calculateDraftSignal(row("Edgar"), { ...context, bannedNames: ["R-T"] });

    expect(brawlScopeCounterData.edgar.counteredBy).toContain("R-T");
    expect(signal.bonusSources.bannedCounters).toEqual(["R-T"]);
    expect(signal.scoreBreakdown.banPoints).toBeGreaterThan(0);
  });
});

describe("ajuste do Counter por Pick", () => {
  const context = { enemyRows: [row("Mico")] };
  const points = (counterPickMultiplier: number) =>
    calculateDraftSignal(row("Nori"), { ...context, ruleSettings: { counterPickMultiplier } }).scoreBreakdown.counterPoints;

  it("mantém a percentagem publicada no valor padrão", () => {
    expect(defaultDraftRuleSettings.counterPickMultiplier).toBe(1);
  });

  it("duplica, triplica e reduz o peso do confronto", () => {
    const base = points(1);

    expect(points(2)).toBeCloseTo(base * 2, 6);
    expect(points(3)).toBeCloseTo(base * 3, 6);
    expect(points(0.5)).toBeCloseTo(base * 0.5, 6);
  });

  it("limita o ajuste ao intervalo oferecido na interface", () => {
    expect(normalizeDraftRuleSettings({ counterPickMultiplier: 9 }).counterPickMultiplier).toBe(3);
    expect(normalizeDraftRuleSettings({ counterPickMultiplier: 0 }).counterPickMultiplier).toBe(0.25);
    expect(counterPickMultiplierOptions).toContain(3);
    expect(counterPickMultiplierOptions).toContain(0.5);
  });

  it("declara o ajuste na leitura do Score quando não é neutro", () => {
    const signal = calculateDraftSignal(row("Nori"), { ...context, ruleSettings: { counterPickMultiplier: 3 } });

    expect(signal.scoreBreakdown.counterPickMultiplier).toBe(3);
    expect(signal.reasons.join(" ")).toContain("× 3");
  });
});

describe("cobertura publicada por brawler", () => {
  it("distingue um brawler sem counters de uma lista em falta", () => {
    const amber = getBrawlScopeCoverage("Amber");

    expect(amber.published).toBe(true);
    expect(amber.total).toBeGreaterThan(100);
    expect(amber.counters).toBe(0);
    expect(amber.targets).toBe(amber.total);
    expect(brawlScopeCounterData.amber.counteredBy).toEqual([]);

    expect(getBrawlScopeCoverage("BrawlerInexistente")).toMatchObject({ published: false, total: 0 });
  });

  it("conta os dois sentidos na perspetiva do titular", () => {
    const crow = getBrawlScopeCoverage("Crow");

    expect(crow.counters).toBeGreaterThan(crow.targets);
    expect(crow.hardest?.value).toBeLessThan(0);
    expect(getBrawlScopeCoverage("Nori").counters).toBeGreaterThan(0);
    expect(getBrawlScopeCoverage("Nori").targets).toBeGreaterThan(0);
  });
});
