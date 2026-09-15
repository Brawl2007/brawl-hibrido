import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setCounterSyncSnapshot, getCounterSourceProfiles } from "@shared/counterSourceRelations";
import { calculateDraftSignal, getBrawlerClass, getCounterProfile, inferDraftRole, isOpeningLongRangeEligible } from "@shared/draft";
import { getMatchupValue } from "@shared/counterMatchupValue";

beforeEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));
afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: false }));

const row = (brawler: string) => ({ brawler, score: 70, tier: "A" as const, brawlPlanetWinRate: 55 });

/**
 * Auditoria de todos os bónus e desbónus.
 *
 * Nasceu de uma suspeita justificada — "o Fit de lane e o bónus de Ban não estão
 * a funcionar". O Ban estava: exige que o banido seja counter literal do
 * candidato E esteja no Top 25 do mapa, e com 4 bans reais isso acontece a
 * cerca de 46% dos candidatos, mudando a ordem do ranking em todos os mapas.
 *
 * O Fit não estava: com a equipa vazia valia zero, ou seja, nos dois primeiros
 * picks do draft o bónus nunca existia. Passou a existir como Fit de abertura,
 * escalado pela prioridade da função no modo.
 *
 * Sem estes testes, a única forma de responder era ler o motor de cada vez.
 * Cada caso aqui prova que o bónus chega ao Score quando a condição acontece, e
 * que não chega quando não acontece — que é o que impede o teste de ser inútil.
 */
describe("todos os bónus chegam ao Score quando a condição acontece", () => {
  it("Counter por pick", () => {
    const alvo = getCounterProfile("Brock").counters.find((name) => getMatchupValue("Brock", name).total > 0)!;
    const com = calculateDraftSignal(row("Brock"), { enemyRows: [row(alvo)], pickNumber: 2 });
    const sem = calculateDraftSignal(row("Brock"), { enemyRows: [], pickNumber: 2 });

    expect(com.scoreBreakdown.counterPoints).toBeGreaterThan(0);
    expect(sem.scoreBreakdown.counterPoints).toBe(0);
  });

  it("Counter banido — e só com as duas condições reunidas", () => {
    const counterDoBrock = getCounterProfile("Brock").counteredBy[0]!;
    const contexto = { enemyRows: [], pickNumber: 1 as const };

    const completo = calculateDraftSignal(row("Brock"), {
      ...contexto,
      bannedNames: new Set([counterDoBrock]),
      baseHybridTop25Names: new Set([counterDoBrock]),
    });
    // Banido, mas fora do Top 25 do mapa: não paga.
    const semTop25 = calculateDraftSignal(row("Brock"), {
      ...contexto,
      bannedNames: new Set([counterDoBrock]),
      baseHybridTop25Names: new Set<string>(),
    });

    expect(completo.scoreBreakdown.banPoints).toBeGreaterThan(0);
    expect(semTop25.scoreBreakdown.banPoints).toBe(0);
  });

  it("Fit Mid — conta com aliado e também no primeiro pick", () => {
    const mid = ["Brock", "Piper", "Gene", "Byron"].find((name) => inferDraftRole(name) === "mid")!;
    const side = ["Bull", "Frank", "El Primo"].find((name) => inferDraftRole(name) === "side")!;

    const comAliado = calculateDraftSignal(row(mid), { allyRows: [row(side)], enemyRows: [], pickNumber: 3 });
    const equipaVazia = calculateDraftSignal(row(mid), { allyRows: [], enemyRows: [], pickNumber: 1 });

    expect(comAliado.scoreBreakdown.missingMidPoints).toBeGreaterThan(0);
    // Era aqui que o bónus morria. Agora paga, mas menos: no primeiro pick a
    // taxa é escalada pela prioridade da função no modo.
    expect(equipaVazia.scoreBreakdown.missingMidPoints).toBeGreaterThan(0);
    expect(equipaVazia.scoreBreakdown.missingMidPoints).toBeLessThan(comAliado.scoreBreakdown.missingMidPoints);
  });

  it("Fit de abertura — a mesma equipa vazia dá taxas diferentes conforme o modo", () => {
    const side = ["Bull", "Frank", "El Primo"].find((name) => inferDraftRole(name) === "side")!;
    const vazio = { allyRows: [], enemyRows: [], pickNumber: 1 as const };

    // Brawl Ball prioriza Lane; Nocaute prioriza Flex. O mesmo brawler de Lane
    // não pode valer o mesmo Fit de abertura nos dois.
    const brawlBall = calculateDraftSignal(row(side), { ...vazio, mapModeId: "brawl-ball" });
    const nocaute = calculateDraftSignal(row(side), { ...vazio, mapModeId: "knockout" });

    const fit = (signal: ReturnType<typeof calculateDraftSignal>) =>
      signal.scoreBreakdown.missingMidPoints + signal.scoreBreakdown.missingSidePoints;

    expect(fit(brawlBall)).toBeGreaterThan(fit(nocaute));
    expect(fit(nocaute)).toBeGreaterThan(0);
  });

  it("Fit de abertura — a razão explica que é o primeiro pick, não uma falta", () => {
    const side = ["Bull", "Frank", "El Primo"].find((name) => inferDraftRole(name) === "side")!;
    const abertura = calculateDraftSignal(row(side), { allyRows: [], enemyRows: [], pickNumber: 1, mapModeId: "brawl-ball" });

    const texto = abertura.reasons.join(" ");
    expect(texto).toContain("Fit de abertura");
    // Dizer "a equipa tem 0/2 Lanes" num draft que ainda não começou seria mentira.
    expect(texto).not.toContain("Lane em falta");
  });

  it("Fit Lane — mesma regra, para o lado", () => {
    const mid = ["Brock", "Piper", "Gene", "Byron"].find((name) => inferDraftRole(name) === "mid")!;
    const side = ["Bull", "Frank", "El Primo"].find((name) => inferDraftRole(name) === "side")!;

    const comAliado = calculateDraftSignal(row(side), { allyRows: [row(mid)], enemyRows: [], pickNumber: 3 });
    const abertura = calculateDraftSignal(row(side), { allyRows: [], enemyRows: [], pickNumber: 1 });

    expect(comAliado.scoreBreakdown.missingSidePoints).toBeGreaterThan(0);
    // No primeiro pick também paga, mas escalado: nunca mais do que a taxa cheia.
    expect(abertura.scoreBreakdown.missingSidePoints).toBeGreaterThan(0);
    expect(abertura.scoreBreakdown.missingSidePoints).toBeLessThanOrEqual(comAliado.scoreBreakdown.missingSidePoints);
  });

  it("Alcance de abertura — só nos três primeiros picks", () => {
    const longo = ["Brock", "Piper", "Bea", "Belle"].find(isOpeningLongRangeEligible)!;

    expect(calculateDraftSignal(row(longo), { enemyRows: [], pickNumber: 1 }).scoreBreakdown.openingLongRangePoints).toBeGreaterThan(0);
    expect(calculateDraftSignal(row(longo), { enemyRows: [], pickNumber: 5 }).scoreBreakdown.openingLongRangePoints).toBe(0);
  });

  it("Sinergia", () => {
    const aliado = getCounterSourceProfiles("Brock").flatMap((profile) => profile.bestTeammates ?? [])[0]?.brawler;
    expect(aliado).toBeDefined();

    const com = calculateDraftSignal(row("Brock"), { allyRows: [row(aliado!)], enemyRows: [], pickNumber: 2 });
    expect(com.scoreBreakdown.synergyPoints).not.toBe(0);
  });

  it("Desbónus de classe repetida", () => {
    const classeBrock = getBrawlerClass("Brock");
    const mesmaClasse = ["Colt", "Rico", "Piper", "8-Bit", "Bea"].find((name) => name !== "Brock" && getBrawlerClass(name) === classeBrock)!;
    const outraClasse = ["Bull", "Frank", "El Primo"].find((name) => getBrawlerClass(name) !== classeBrock)!;

    expect(calculateDraftSignal(row("Brock"), { allyRows: [row(mesmaClasse)], enemyRows: [] }).scoreBreakdown.sameClassPenaltyPoints).toBeGreaterThan(0);
    expect(calculateDraftSignal(row("Brock"), { allyRows: [row(outraClasse)], enemyRows: [] }).scoreBreakdown.sameClassPenaltyPoints).toBe(0);
  });

  it("Desbónus de Worst Teammate", () => {
    const pior = getCounterSourceProfiles("8-Bit").flatMap((profile) => profile.worstTeammates ?? [])[0]?.brawler;
    expect(pior).toBeDefined();

    expect(calculateDraftSignal(row("8-Bit"), { allyRows: [row(pior!)], enemyRows: [] }).scoreBreakdown.worstTeammatePenaltyPoints).toBeGreaterThan(0);
  });

  it("os dois desbónus desligados continuam a zero, de propósito", () => {
    /**
     * Não são avarias: o confronto desfavorável já desconta pelo delta com sinal,
     * e Counter no Top é risco possível e não confronto real. Estão assinalados
     * como "não aplicado" na interface — este teste impede que voltem sem querer.
     */
    const counterDoBrock = getCounterProfile("Brock").counteredBy[0]!;
    const signal = calculateDraftSignal(row("Brock"), {
      enemyRows: [row(counterDoBrock)],
      pickNumber: 2,
      isCandidateUnselected: true,
      topRecommendationNames: ["Brock", counterDoBrock],
    });

    expect(signal.scoreBreakdown.enemyCounterPenaltyPoints).toBe(0);
    expect(signal.scoreBreakdown.topTwentyCounterPenaltyPoints).toBe(0);
  });
});
