import { afterEach, beforeEach, describe, expect, it, beforeAll, afterAll } from "vitest";
import { setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import { allRankedRows } from "../client/src/data/rankedData";
import { analyzeDraftComposition, brawlerClassCatalog, buildScrimSequence, calculateDraftSignal as calculateDraftSignalDoMotor, calculateLaneMatchup, draftSignalBonuses, draftSteps, estimateDraftWinProbability, getBannedCounterBonusPick, getBannedCounterBonusRate, getBrawlerClass, getCounterBonusRate, getCounterMatchup, getCounterProfile, getDraftCounterWindow, getDraftLockedNames, getDraftTopRecommendationNames, getGlobalPickNumber, getLiveCounterSuggestions, getMapTeamSynergyRate, getPositionRecommendation, getSynergyBonusRate, getTopCounterWindowSize, inferDraftRole, isArtilleryBrawler, isOpeningLongRangeEligible, normalizeScrimSequence, officialBrawlerClasses, openingRangeThreshold, rankCounterRows, rankDraftEntries as rankDraftEntriesDoMotor, rankDraftRows, rankHybridUsageRows, remapDraftProgress } from "@shared/draft";
import { getCounterSourceProfiles, getLiteralCounterRelations, getResolvedCounterDirection } from "@shared/counterSourceRelations";
import { defaultDraftRuleSettings, normalizeDraftRuleSettings } from "@shared/draftRules";
import { brawlScopeCounterData } from "@shared/brawlScopeCounterData";
import { getMatchupValue } from "@shared/counterMatchupValue";
import { normalizeCounterBrawlerName } from "@shared/counterSyncSnapshot";
import { definirLeituraDasDuasFichas as definirFichasDoFicheiro } from "@shared/counterMatchupValue";

/**
 * v168: por omissão, um confronto só conta a partir de 55% (`counterMinimo`).
 * Este ficheiro mede a mecânica dos counters (sinal por lado, cobertura,
 * direções, penalizações) com deltas pequenos, por isso corre com o limiar de
 * antes (50%: qualquer diferença conta). O limiar tem testes próprios em
 * `server/regrasV168.test.ts`, com o motor tal como vem.
 */
// Estes testes isolam a leitura dos confrontos; a escada de multiplicadores tem suite própria.
const SEM_LIMIAR = { counterMinimo: 0.5, counterPickMultiplier: 1, enemyCounterPenalty: 0 };
type ContextoDoSinal = NonNullable<Parameters<typeof calculateDraftSignalDoMotor>[1]>;
const calculateDraftSignal: typeof calculateDraftSignalDoMotor = (row, context = {} as ContextoDoSinal, ...resto) =>
  calculateDraftSignalDoMotor(row, { ...context, ruleSettings: { ...SEM_LIMIAR, ...context.ruleSettings } }, ...resto);
const rankDraftEntries: typeof rankDraftEntriesDoMotor = (rows, locked, query, tier, context = {}) =>
  rankDraftEntriesDoMotor(rows, locked, query, tier, { ...context, ruleSettings: { ...SEM_LIMIAR, ...context.ruleSettings } });

// Este ficheiro prova a leitura de uma só ficha (a do candidato), a regra de
// antes da v153. A média das duas fichas tem os testes em `duasFichas.test.ts`.
beforeAll(() => definirFichasDoFicheiro(false));
afterAll(() => definirFichasDoFicheiro(true));

/**
 * Pontos de Counter esperados para um confronto, calculados a partir da regra do
 * motor em vez de um número fixo.
 *
 * Historicamente estes testes tinham os valores escritos à mão (3,45 / 3,5 / 6,9),
 * de quando o bónus era uma taxa fixa de 5% por matchup. Hoje o bónus é o delta
 * publicado pelo BrawlScope, que muda sempre que os dados são reimportados — e um
 * teste que fixa o valor do dia passa a acusar falha a cada atualização de dados,
 * sem que nada esteja partido. O que interessa verificar é a regra:
 *
 *     pontos = Score × Σ(delta / 100) × multiplicador
 *
 * Assim o teste continua a proteger a fórmula e deixa os dados respirar.
 */
function expectedCounterRate(attacker: string, defenders: string[], multiplier = 1) {
  return defenders.reduce((sum, defender) => {
    // O motor soma todos os deltas não nulos, incluindo os desfavoráveis.
    const { total } = getMatchupValue(attacker, defender);
    return sum + (total === 0 ? 0 : total / 100);
  }, 0) * multiplier;
}

function expectedCounterPoints(score: number, attacker: string, defenders: string[], multiplier = 1) {
  return score * expectedCounterRate(attacker, defenders, multiplier);
}

/**
 * Taxa de Sinergia efetiva. O breakdown deixou de reportar a taxa fixa do pick:
 * quando a fonte publica uma percentagem para o par ("Pair with · X +11,6"), é
 * essa que vale, e a taxa configurada só entra quando não há percentagem nenhuma.
 */
function expectedSynergyRate(owner: string, allies: string[], configuredRate: number) {
  const profiles = getCounterSourceProfiles(owner);
  const teammatesOf = (source: string) => profiles.find((profile) => profile.source === source)?.bestTeammates ?? [];
  const isAlly = (name: string) => allies.some((ally) => normalizeCounterBrawlerName(ally) === normalizeCounterBrawlerName(name));
  // A mesma prioridade de fontes do motor: BrawlScope antes de Brawl Planet.
  const scope = teammatesOf("BrawlScope").filter((relation) => isAlly(relation.brawler));
  const active = scope.length ? scope : teammatesOf("Brawl Planet").filter((relation) => isAlly(relation.brawler));
  const published = active.reduce(
    (sum, relation) => sum + (typeof relation.delta === "number" && Number.isFinite(relation.delta) ? relation.delta / 100 : 0),
    0,
  );
  return published !== 0 ? published : configuredRate;
}

/** O mesmo cálculo, na frase que o Draft mostra no resumo de bónus ativos. */
function expectedCounterBonusLabel(attacker: string, defenders: string[]) {
  const rate = expectedCounterRate(attacker, defenders);
  const matchups = defenders.filter((defender) => getMatchupValue(attacker, defender).total !== 0).length;
  return `Counter ${rate > 0 ? "+" : ""}${Number((rate * 100).toFixed(2))}% (${matchups} matchup${matchups === 1 ? "" : "s"} · delta BrawlScope)`;
}

/** Nomes do catálogo Ranked ativo, para procurar pares em vez de os fixar à mão. */
const rankedBrawlerNames = Array.from(new Set(allRankedRows.map((row) => row.brawler)));

// Estes testes auditam catálogos estáticos; produção continua a exigir snapshot live.
beforeEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));
afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: false }));

describe("draft engine", () => {
  it("preserva o Score Vitória/Uso pré-calculado como base do Draft", () => {
    const signal = calculateDraftSignal({
      brawler: "Brock",
      score: 73.54,
      tier: "A" as const,
      brawlPlanetWinRate: 60,
      usage: 12.2,
    });

    expect(signal.scoreBreakdown.hybridScore).toBeCloseTo(73.54, 4);
  });

  it("preserva os bónus contextuais quando o Score Vitória/Uso já foi calculado no ranking", () => {
    const brock = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53, usage: 10 };
    const counterTarget = getCounterProfile("Brock").counters[0]!;
    const context = { enemyRows: [{ brawler: counterTarget, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }], pickNumber: 2 };
    const official = calculateDraftSignal(brock, context);
    const experimental = calculateDraftSignal(brock, { ...context, experimentalWeights: { winRate: 50, usageRate: 50 } });

    expect(experimental.scoreBreakdown.hybridScore).toBeCloseTo(official.scoreBreakdown.hybridScore, 6);
    expect(experimental.scoreBreakdown.hybridScore).toBeCloseTo(69, 6);
    // A taxa configurada continua a ser reportada, mas os pontos vêm do delta
    // publicado para o par — por isso a asserção usa a fórmula, não a taxa.
    expect(experimental.scoreBreakdown.counterBonusRate).toBe(0.08);
    expect(experimental.scoreBreakdown.counterPoints)
      .toBeCloseTo(expectedCounterPoints(experimental.scoreBreakdown.hybridPoints, "Brock", [counterTarget]), 6);
    expect(getMatchupValue("Brock", counterTarget).total).toBeGreaterThan(0);
    expect(experimental.draftScore).toBeGreaterThan(experimental.scoreBreakdown.hybridPoints);
  });

  it("normalizes the best available Hybrid Score to 100 Base Points and applies counter after the scale", () => {
    const brock = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53, topBrawlScore: 10 };
    const counterTarget = getCounterProfile("Brock").counters[0]!;
    const target = { brawler: counterTarget, score: 60, tier: "B" as const, brawlPlanetWinRate: 45, topBrawlScore: 7 };

    const [entry] = rankDraftEntries([brock, target], new Set([counterTarget]), "", "Todos", {
      allyRows: [],
      enemyRows: [target],
      pickNumber: 2,
      ruleSettings: { missingMid: 0, missingSide: 0, openingLongRange: 0 },
    });

    // O Counter entra depois da escala: a Base do melhor Score vale 100 pontos e o
    // delta do matchup é aplicado sobre ela, inteiro. Havia aqui um tecto por
    // estado de draft que cortava este mesmo valor; saiu, e o que o cartão soma é
    // o que o Score leva.
    const counterPoints = expectedCounterPoints(brock.score, "Brock", [counterTarget]);

    expect(entry?.row.brawler).toBe("Brock");
    expect(entry?.basePoints).toBeCloseTo(100, 6);
    expect(entry?.finalPoints).toBeGreaterThan(100);
    expect(entry?.finalPoints).toBeCloseTo((brock.score + counterPoints) / brock.score * 100, 6);
    expect(entry?.signal.scoreBreakdown.hybridScore).toBeCloseTo(calculateDraftSignal(brock).scoreBreakdown.hybridScore, 6);
  });

  it("keeps Base Points tied to the original map reference after bans and picks", () => {
    const rows = [
      { brawler: "Brock", score: 71, tier: "A" as const, brawlPlanetWinRate: 70, topBrawlScore: 10 },
      { brawler: "Shelly", score: 63, tier: "A" as const, brawlPlanetWinRate: 60, topBrawlScore: 10 },
      { brawler: "Nita", score: 55, tier: "B" as const, brawlPlanetWinRate: 50, topBrawlScore: 10 },
    ];
    const original = rankDraftEntries(rows, new Set());
    const shellyOriginal = original.find((entry) => entry.row.brawler === "Shelly");
    const nitaOriginal = original.find((entry) => entry.row.brawler === "Nita");

    const afterBrockBan = rankDraftEntries(rows, new Set(["Brock"]));
    const shellyAfterBan = afterBrockBan.find((entry) => entry.row.brawler === "Shelly");
    const afterBrockBanAndShellyPick = rankDraftEntries(rows, new Set(["Brock", "Shelly"]));
    const nitaAfterPick = afterBrockBanAndShellyPick.find((entry) => entry.row.brawler === "Nita");

    expect(original.find((entry) => entry.row.brawler === "Brock")?.basePoints).toBeCloseTo(100, 6);
    expect(shellyOriginal?.basePoints).toBeLessThan(100);
    expect(shellyAfterBan?.basePoints).toBeCloseTo(shellyOriginal?.basePoints ?? 0, 6);
    expect(shellyAfterBan?.basePoints).toBeLessThan(100);
    expect(nitaAfterPick?.basePoints).toBeCloseTo(nitaOriginal?.basePoints ?? 0, 6);
    expect(nitaAfterPick?.basePoints).toBeLessThan(100);
  });

  it("normalizes configurable Draft percentages safely and preserves the competitive defaults", () => {
    expect(normalizeDraftRuleSettings()).toEqual(defaultDraftRuleSettings);
    expect(normalizeDraftRuleSettings({ counterPick2: 0.235, enemyCounterPenalty: -1, sameClassPenalty: 4 })).toMatchObject({
      counterPick2: 0.235,
      enemyCounterPenalty: 0,
      sameClassPenalty: 1,
      synergyPick3: 0.07,
    });
  });

  it("uses customized counter, ban, synergy and enemy-counter rates in contextual Draft scoring", () => {
    const brock = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53, topBrawlScore: 10 };
    const counterTarget = getCounterProfile("Brock").counters[0]!;
    const enemyCounter = getCounterProfile("Brock").counteredBy[0]!;
    const rules = {
      counterPick2: 0.23,
      // O ajuste que escala mesmo os pontos de Counter é o multiplicador: a taxa
      // por pick passou a ser só o que o breakdown reporta, porque os pontos
      // seguem o delta publicado do confronto.
      counterPickMultiplier: 2,
      synergyPick3: 0.19,
      banPick4: 0.12,
      enemyCounterPenalty: 0.17,
    };
    const counterSignal = calculateDraftSignal(brock, {
      enemyRows: [{ brawler: counterTarget, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }],
      pickNumber: 2,
      ruleSettings: rules,
    });
    const pressureSignal = calculateDraftSignal(brock, {
      enemyRows: [{ brawler: enemyCounter, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }],
      pickNumber: 2,
      ruleSettings: rules,
    });

    expect(counterSignal.scoreBreakdown.counterBonusRate).toBe(0.23);
    expect(counterSignal.scoreBreakdown.counterPoints)
      .toBeCloseTo(expectedCounterPoints(counterSignal.scoreBreakdown.hybridPoints, "Brock", [counterTarget], 2), 6);
    // O piso só completa a parte de risco que o delta negativo ainda não pagou.
    expect(getMatchupValue("Brock", enemyCounter).total).toBeLessThan(0);
    const complemento = Math.max(0, rules.enemyCounterPenalty - Math.abs(getMatchupValue("Brock", enemyCounter).total) / 100 * 2);
    expect(pressureSignal.scoreBreakdown.enemyCounterPenaltyPercent).toBeCloseTo(complemento * 100);
    expect(pressureSignal.scoreBreakdown.enemyCounterPenaltyPoints).toBeCloseTo(pressureSignal.scoreBreakdown.hybridPoints * complemento);
    expect(pressureSignal.scoreBreakdown.counterPoints)
      .toBeCloseTo(expectedCounterPoints(pressureSignal.scoreBreakdown.hybridPoints, "Brock", [enemyCounter], 2), 6);
    expect(pressureSignal.scoreBreakdown.counterPoints).toBeLessThan(0);
    expect(getSynergyBonusRate(3, rules)).toBe(0.19);
    expect(getBannedCounterBonusRate(4, rules)).toBe(0.12);
  });

  it("uses an independent synergy setting for every Pick and mirrors it in the map composition", () => {
    const rules = {
      synergyPick1: 0.01,
      synergyPick2: 0.02,
      synergyPick3: 0.03,
      synergyPick4: 0.04,
      synergyPick5: 0.05,
      synergyPick6: 0.06,
    };

    expect([1, 2, 3, 4, 5, 6].map((pick) => getSynergyBonusRate(pick, rules))).toEqual([0.01, 0.02, 0.03, 0.04, 0.05, 0.06]);
    expect([1, 2, 3, 4, 5, 6].map((pick) => getMapTeamSynergyRate(pick, rules))).toEqual([0.01, 0.02, 0.03, 0.04, 0.05, 0.06]);
  });

  // Antes o vencedor do par era decidido pelo Score contextual mais alto e o
  // lado perdedor devolvia null. Hoje cada lado é lido pela percentagem que a
  // fonte publica na ficha desse brawler, por isso o mapa de Scores recíprocos
  // já não altera o confronto — e dois brawlers podem punir-se mutuamente.
  it("reads each side of a matchup from the published delta, ignoring the reciprocal contextual Score", () => {
    const attacker = "Surge";
    const defender = getCounterProfile(attacker).counters.find((name) => getMatchupValue(attacker, name).total > 0)!;
    const key = (name: string) => name.toLowerCase();
    const attackerAhead = new Map([[key(attacker), 80], [key(defender), 70]]);
    const defenderAhead = new Map([[key(attacker), 70], [key(defender), 80]]);
    const tied = new Map([[key(attacker), 75], [key(defender), 75]]);

    expect(defender).toBeDefined();
    for (const scores of [attackerAhead, defenderAhead, tied, undefined]) {
      expect(getCounterMatchup(attacker, defender, scores)).toMatchObject({
        attacker,
        defender,
        counterDelta: getMatchupValue(attacker, defender).total,
      });
    }

    // Sem percentagem publicada para o par continua a não haver confronto.
    const unpublished = rankedBrawlerNames
      .flatMap((left) => rankedBrawlerNames.map((right) => [left, right] as const))
      .find(([left, right]) => left !== right && getMatchupValue(left, right).base === null)!;
    expect(unpublished).toBeDefined();
    expect(getCounterMatchup(unpublished[0], unpublished[1], tied)).toBeNull();
  });

	  // O par deixou de ter um "vencedor" decidido pelo Score contextual: cada lado
	  // soma o seu próprio delta com sinal e o desbónus separado de Enemy Counter
	  // está desligado, porque o delta negativo já é a penalização do confronto.
	  it("signs Counter points per side and no longer adds a separate Enemy Counter penalty", () => {
	    const attacker = "Surge";
	    const favourable = getCounterProfile(attacker).counters.find((name) => getMatchupValue(attacker, name).total > 0)!;
	    const unfavourable = getCounterProfile(attacker).counteredBy.find((name) => getMatchupValue(attacker, name).total < 0)!;
	    const row = (brawler: string) => ({ brawler, score: 70, tier: "A" as const, brawlPlanetWinRate: 54 });
	    const surgeAhead = new Map([[attacker.toLowerCase(), 80], [favourable.toLowerCase(), 70], [unfavourable.toLowerCase(), 70]]);
	    const foeAhead = new Map([[attacker.toLowerCase(), 70], [favourable.toLowerCase(), 80], [unfavourable.toLowerCase(), 80]]);

	    expect(favourable).toBeDefined();
	    expect(unfavourable).toBeDefined();

	    const winning = calculateDraftSignal(row(attacker), { enemyRows: [row(favourable)], pickNumber: 2, reciprocalCounterScores: surgeAhead });
	    const losing = calculateDraftSignal(row(attacker), { enemyRows: [row(unfavourable)], pickNumber: 2, reciprocalCounterScores: surgeAhead });
	    const winningBehind = calculateDraftSignal(row(attacker), { enemyRows: [row(favourable)], pickNumber: 2, reciprocalCounterScores: foeAhead });

	    expect(winning.scoreBreakdown.counterPoints)
	      .toBeCloseTo(expectedCounterPoints(winning.scoreBreakdown.hybridPoints, attacker, [favourable]), 6);
	    expect(winning.scoreBreakdown.counterPoints).toBeGreaterThan(0);
	    // Confronto desfavorável: os mesmos pontos de Counter, agora a subtrair.
	    expect(losing.scoreBreakdown.counterPoints)
	      .toBeCloseTo(expectedCounterPoints(losing.scoreBreakdown.hybridPoints, attacker, [unfavourable]), 6);
	    expect(losing.scoreBreakdown.counterPoints).toBeLessThan(0);
	    expect(losing.scoreBreakdown.enemyCounterPenaltyPoints).toBe(0);
	    expect(losing.scoreBreakdown.enemyCounterPenaltyPercent).toBe(0);
	    /**
     * Comparação contra um controlo com o mesmo contexto e sem adversário. O
     * Fit de abertura também entra nos dois lados, por isso comparar com o
     * Score base puro deixaria de medir o Counter e passaria a medir a soma.
     */
    const neutro = calculateDraftSignal(row(attacker), { enemyRows: [], pickNumber: 2, reciprocalCounterScores: surgeAhead });
    expect(losing.draftScore).toBeLessThan(neutro.draftScore);
	    // O Score recíproco já não participa na decisão.
	    expect(winningBehind.scoreBreakdown.counterPoints).toBeCloseTo(winning.scoreBreakdown.counterPoints, 6);
  });

  it("stabilizes the contextual counter decision inside the ranked Draft", () => {
    // O inimigo é procurado no catálogo: precisamos de um confronto publicado a
    // favor do candidato para o Counter somar, sem fixar o par no teste.
    const favourable = getCounterProfile("Surge").counters.find((name) => getMatchupValue("Surge", name).total > 0)!;
    const surge = { brawler: "Surge", score: 80, tier: "A" as const, brawlPlanetWinRate: 60, usage: 10 };
    const enemy = { brawler: favourable, score: 70, tier: "A" as const, brawlPlanetWinRate: 45, usage: 8 };
    const context = { enemyRows: [enemy], pickNumber: 2 };
    const highSurge = rankDraftEntries([surge, enemy], new Set([favourable]), "", "Todos", context);
    const repeatedHighSurge = rankDraftEntries([surge, enemy], new Set([favourable]), "", "Todos", context);

    expect(favourable).toBeDefined();
    expect(highSurge[0].row.brawler).toBe("Surge");
    expect(highSurge[0].signal.scoreBreakdown.counterPoints).toBeGreaterThan(0);
    expect(repeatedHighSurge).toEqual(highSurge);
  });

  it("keeps the competitive ban/pick sequence balanced between teams", () => {
    expect(draftSteps).toHaveLength(12);
    expect(draftSteps.filter((step) => step.kind === "ban")).toHaveLength(6);
    expect(draftSteps.filter((step) => step.kind === "pick")).toHaveLength(6);
    expect(draftSteps.filter((step) => step.team === "blue")).toHaveLength(6);
    expect(draftSteps.filter((step) => step.team === "red")).toHaveLength(6);
  });

  it("uses a mirrored 1–2–2–1 pick order from either initial side", () => {
    const blueStart = buildScrimSequence("standard", "blue");
    const redStart = buildScrimSequence("standard", "red");
    const bluePicks = blueStart.filter((step) => step.kind === "pick").map((step) => step.team);
    const redPicks = redStart.filter((step) => step.kind === "pick").map((step) => step.team);
    expect(blueStart).toHaveLength(12);
    expect(blueStart[0]).toMatchObject({ kind: "ban", team: "blue" });
    expect(blueStart[6]).toMatchObject({ kind: "pick", team: "blue" });
    expect(bluePicks).toEqual(["blue", "red", "red", "blue", "blue", "red"]);
    expect(blueStart.map((step) => `${step.kind}:${step.team}`)).toEqual([
      "ban:blue", "ban:red", "ban:blue", "ban:red", "ban:blue", "ban:red",
      "pick:blue", "pick:red", "pick:red", "pick:blue", "pick:blue", "pick:red",
    ]);
    expect(redStart[0]).toMatchObject({ kind: "ban", team: "red" });
    expect(redStart[6]).toMatchObject({ kind: "pick", team: "red" });
    expect(redPicks).toEqual(["red", "blue", "blue", "red", "red", "blue"]);
    expect(buildScrimSequence("fast", "blue")).toHaveLength(10);
  });

  it("counts the global pick number across both teams regardless of which side opens", () => {
    const blueStart = buildScrimSequence("standard", "blue");
    const redStart = buildScrimSequence("standard", "red");

    expect([6, 7, 8, 9, 10, 11].map((index) => getGlobalPickNumber(blueStart, index))).toEqual([1, 2, 3, 4, 5, 6]);
    expect([6, 7, 8, 9, 10, 11].map((index) => getGlobalPickNumber(redStart, index))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getGlobalPickNumber(blueStart, 0)).toBeUndefined();
  });

  it("uses the shared global order when Red opens and Blue makes picks 2 and 3", () => {
    const redStart = buildScrimSequence("standard", "red");
    const redOpeningIndex = 6;
    const blueSecondIndex = 7;
    const blueThirdIndex = 8;
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const enemyRows = [{ brawler: "Mortis", score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }];

    expect(redStart[redOpeningIndex]).toMatchObject({ team: "red", kind: "pick" });
    expect(redStart[blueSecondIndex]).toMatchObject({ team: "blue", kind: "pick" });
    expect(redStart[blueThirdIndex]).toMatchObject({ team: "blue", kind: "pick" });
    expect([redOpeningIndex, blueSecondIndex, blueThirdIndex].map((index) => getGlobalPickNumber(redStart, index))).toEqual([1, 2, 3]);
    expect(calculateDraftSignal(row, { enemyRows, pickNumber: getGlobalPickNumber(redStart, blueSecondIndex) }).scoreBreakdown.counterBonusRate).toBe(0.08);
    expect(calculateDraftSignal(row, { enemyRows, pickNumber: getGlobalPickNumber(redStart, blueThirdIndex) }).scoreBreakdown.counterBonusRate).toBe(0.10);
  });

  it("uses one contextual Score entry for the rank number, ordering and displayed points", () => {
    const rows = [
      { brawler: "Shelly", score: 60, tier: "B" as const, brawlPlanetWinRate: 50 },
      { brawler: "Brock", score: 82, tier: "S" as const, brawlPlanetWinRate: 60 },
      { brawler: "Nita", score: 71, tier: "A" as const, brawlPlanetWinRate: 55 },
    ];
    const entries = rankDraftEntries(rows, new Set(), "", "Todos", { pickNumber: 2 });

    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(entries.every((entry, index) => index === 0 || entries[index - 1].draftScore >= entry.draftScore)).toBe(true);
    expect(rankDraftRows(rows, new Set(), "", "Todos", { pickNumber: 2 })).toEqual(entries.map((entry) => entry.row));
  });

  it("uses one complete Flaring Phoenix Counter Top window after the six reported bans", () => {
    const bannedNames = new Set(["Mr. P", "Ash", "8-bit", "Nita", "Finx", "Griff"]);
    const rows = allRankedRows.filter((row) => row.map === "Flaring Phoenix");
    const baseContext = { bannedNames, pickNumber: 1, completedPickCount: 0, mapModeId: "knockout" };
    const counterWindow = getDraftCounterWindow(rows, bannedNames, "", baseContext);
    const entries = rankDraftEntries(rows, bannedNames, "", "Todos", { ...baseContext, ...counterWindow });
    const surge = entries.find((entry) => entry.row.brawler === "Surge");

    expect(surge).toBeDefined();
    expect(counterWindow.topRecommendationNames).toHaveLength(20);
    expect(counterWindow.counterPenaltyEligibleNames).toEqual(counterWindow.topRecommendationNames);
    expect(surge?.signal.bonusSources.topTwentyCounters.every((counter) => counterWindow.counterPenaltyEligibleNames.includes(counter))).toBe(true);
  });

  it("uses every literal counter inside, and no counter outside, the active visible window on any Ranked map", () => {
    const mapNames = Array.from(new Set(allRankedRows.map((row) => row.map)));

    for (const mapName of mapNames) {
      const rows = allRankedRows.filter((row) => row.map === mapName);
      for (let completedPickCount = 0; completedPickCount < 6; completedPickCount += 1) {
        const context = {
          bannedNames: new Set<string>(),
          pickNumber: completedPickCount + 1,
          completedPickCount,
        };
        const counterWindow = getDraftCounterWindow(rows, context.bannedNames, "", context);
        const entries = rankDraftEntries(rows, context.bannedNames, "", "Todos", { ...context, ...counterWindow });
        expect(
          counterWindow.counterPenaltyEligibleNames,
          `${mapName} — pick ${context.pickNumber}`,
        ).toEqual(counterWindow.topRecommendationNames);
        for (const entry of entries) {
          const expectedCounters = counterWindow.topRecommendationNames.filter((counter) =>
            counter.toLowerCase() !== entry.row.brawler.toLowerCase()
            // A ficha do candidato tem a última palavra: uma relação literal publicada
            // na página do adversário não vale como Counter Top quando o delta do
            // próprio candidato mostra o confronto como favorável.
            && getMatchupValue(entry.row.brawler, counter).total < 0
            && getLiteralCounterRelations(counter, entry.row.brawler).length > 0,
          );
          expect(
            entry.signal.bonusSources.topTwentyCounters,
            `${mapName} — pick ${context.pickNumber} · ${entry.row.brawler}`,
          ).toEqual(expectedCounters);
        }
      }
    }
  }, 180_000);

  // O par já não é fixo: os catálogos foram reimportados e a direção de cada
  // confronto passou a ser o sinal do delta publicado. O teste procura no mapa um
  // aliado e um candidato que o inimigo countere, e um candidato que ele não
  // countere, e verifica a regra sobre esses.
  it("applies the current canonical counter directions in Flaring Phoenix after an enemy pick", () => {
    const rows = allRankedRows.filter((row) => row.map === "Flaring Phoenix");
    const enemy = rows.find((row) => row.brawler === "Surge")!;
    const delta = (name: string) => getMatchupValue(name, enemy.brawler, "knockout").total;
    const counteredNames = rows
      .map((row) => row.brawler)
      .filter((name) => name !== enemy.brawler && delta(name) < 0);
    const ally = rows.find((row) => row.brawler === counteredNames[0])!;
    const pressured = rows.find((row) => row.brawler === counteredNames[1])!;
    const safe = rows.find((row) => row.brawler !== enemy.brawler && delta(row.brawler) > 0)!;

    expect(ally).toBeDefined();
    expect(pressured).toBeDefined();
    expect(safe).toBeDefined();
    expect(delta(pressured.brawler)).toBeLessThan(0);
    expect(delta(safe.brawler)).toBeGreaterThan(0);

    const context = {
      allyRows: [ally],
      enemyRows: [enemy],
      pickNumber: 3,
      completedPickCount: 2,
      mapModeId: "knockout",
    };
    const pressuredSignal = calculateDraftSignal(pressured, context);
    const safeSignal = calculateDraftSignal(safe, context);

    expect(pressuredSignal.bonusSources.enemyCounters).toEqual([enemy.brawler]);
    expect(pressuredSignal.bonusSources.repeatedEnemyCounterPressures).toEqual([
      { enemy: enemy.brawler, counteredAllies: [ally.brawler], rate: defaultDraftRuleSettings.repeatedEnemyCounterPressure },
    ]);
    expect(safeSignal.bonusSources.enemyCounters).toEqual([]);
    expect(safeSignal.bonusSources.repeatedEnemyCounterPressures).toEqual([]);
  });

  it("reutiliza o mesmo sinal contextual para o score ordenado sem alterar o resultado do Draft", () => {
    const rows = [
      { brawler: "Brock", score: 74, tier: "A" as const, brawlPlanetWinRate: 56 },
      { brawler: "Shelly", score: 66, tier: "A" as const, brawlPlanetWinRate: 53 },
      { brawler: "Nita", score: 63, tier: "B" as const, brawlPlanetWinRate: 51 },
    ];
    const context = { enemyRows: [rows[1]], allyRows: [rows[2]], pickNumber: 2 };
    const rankedContext = {
      ...context,
      topRecommendationNames: getDraftTopRecommendationNames(rows, new Set(), "", "Todos", context),
    };
    const entries = rankDraftEntries(rows, new Set(), "", "Todos", context);

    entries.forEach((entry) => {
      expect(entry.signal.draftScore).toBe(entry.draftScore);
      expect(entry.signal).toEqual(calculateDraftSignal(entry.row, rankedContext));
    });
  });

  it("mantém o ranking e todos os sinais idênticos quando as relações canónicas são reutilizadas", () => {
    const rows = allRankedRows.filter((row) => row.map === "Flaring Phoenix" && row.brawler !== "Wendy");
    const surge = rows.find((row) => row.brawler === "Surge")!;
    const bibi = rows.find((row) => row.brawler === "Bibi")!;
    const context = {
      pickNumber: 3,
      completedPickCount: 2,
      allyRows: [bibi],
      enemyRows: [surge],
      mapModeId: "knockout",
    };

    const firstPass = rankDraftEntries(rows, new Set(["Mr. P", "Ash", "8-Bit", "Nita"]), "", "Todos", context);
    const secondPass = rankDraftEntries(rows, new Set(["Mr. P", "Ash", "8-Bit", "Nita"]), "", "Todos", context);

    expect(secondPass).toEqual(firstPass);
    expect(secondPass.map((entry) => [entry.rank, entry.row.brawler, entry.draftScore])).toEqual(
      firstPass.map((entry) => [entry.rank, entry.row.brawler, entry.draftScore]),
    );
  });

  it("preserva o Score competitivo no cálculo leve das passagens internas da janela", () => {
    const rows = allRankedRows.filter((row) => row.map === "Flaring Phoenix");
    const candidate = rows.find((row) => row.brawler === "Surge")!;
    const context = {
      mapModeId: "knockout",
      pickNumber: 2,
      completedPickCount: 1,
      bannedNames: new Set(["Mr. P", "Ash", "8-Bit", "Nita"]),
      allyRows: rows.filter((row) => row.brawler === "Bibi"),
      enemyRows: rows.filter((row) => row.brawler === "Surge"),
    };

    const complete = calculateDraftSignal(candidate, context);
    const lightweight = calculateDraftSignal(candidate, context, false);

    expect(lightweight.draftScore).toBe(complete.draftScore);
    expect(lightweight.scoreBreakdown.contextualAdjustment).toBe(complete.scoreBreakdown.contextualAdjustment);
    expect(lightweight.bonusSources).toEqual(complete.bonusSources);
    expect(lightweight.reasons).toEqual([]);
    expect(lightweight.scoreBreakdown.activeBonuses).toEqual([]);
  });

  it("inclui cada candidato elegível no ranking global antes de a interface paginar o Top", () => {
    const rows = [
      { brawler: "Ash", score: 68, tier: "A" as const, brawlPlanetWinRate: 58 },
      { brawler: "Brock", score: 61, tier: "B" as const, brawlPlanetWinRate: 51 },
      { brawler: "Nita", score: 59, tier: "B" as const, brawlPlanetWinRate: 50 },
    ];
    const entries = rankDraftEntries(rows, new Set(), "", "Todos", { pickNumber: 1 });

    expect(entries).toHaveLength(rows.length);
    expect(entries.map((entry) => entry.row.brawler)).toContain("Ash");
    expect(entries.find((entry) => entry.row.brawler === "Ash")?.rank).toBe(1);
    expect(entries[0].draftScore).toBeGreaterThanOrEqual(entries[1].draftScore);
  });

  it("preserves bans, picks, skipped slots and selection when the opening team changes", () => {
    const blueStart = buildScrimSequence("standard", "blue");
    const redStart = buildScrimSequence("standard", "red");
    const choices = Array<string | null>(blueStart.length).fill(null);
    const skipped = Array<boolean>(blueStart.length).fill(false);
    choices[0] = "Mina";
    choices[1] = "Piper";
    skipped[2] = true;
    choices[6] = "Pearl";
    choices[7] = "Brock";

    const remapped = remapDraftProgress(blueStart, redStart, choices, skipped, 8);

    expect(remapped.choices.filter(Boolean).sort()).toEqual(["Brock", "Mina", "Pearl", "Piper"].sort());
    expect(remapped.choices[0]).toBe("Piper");
    expect(remapped.choices[1]).toBe("Mina");
    expect(remapped.choices[6]).toBe("Brock");
    expect(remapped.choices[7]).toBe("Pearl");
    expect(remapped.skipped[3]).toBe(true);
    expect(remapped.selectedStepIndex).toBe(9);
  });

  it("keeps the assigned Mid or Lane slot when reading a literal 1v1 matchup", () => {
    const brock = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 55 };
    const bea = { brawler: "Bea", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 };
    const midRead = calculateLaneMatchup(brock, bea, "mid");
    const rightLaneRead = calculateLaneMatchup(brock, bea, "right");

    expect(midRead).toMatchObject({ source: "explicit-counter", position: "mid" });
    expect(rightLaneRead).toMatchObject({ source: "explicit-counter", position: "right" });
  });

  it("distinguishes the countering side, the countered side and a neutral 1v1", () => {
    // Par procurado no catálogo: o lado azul tem de punir e o vermelho de ser punido.
    const foeName = rankedBrawlerNames.find((name) =>
      name !== "Brock"
      && getMatchupValue("Brock", name).total > 0
      && getMatchupValue(name, "Brock").total < 0)!;
    const brock = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 55 };
    const foe = { brawler: foeName, score: 70, tier: "A" as const, brawlPlanetWinRate: 55 };
    const counteringBlue = calculateLaneMatchup(brock, foe, "mid");
    const counteredBlue = calculateLaneMatchup(foe, brock, "mid");
    const neutral = calculateLaneMatchup(
      { brawler: "Neutral Azul", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 },
      { brawler: "Neutral Vermelho", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 },
      "mid",
    );

    expect(foeName).toBeDefined();
    expect(counteringBlue).toMatchObject({ ally: "Brock", enemy: foeName, source: "explicit-counter" });
    expect(counteredBlue).toMatchObject({ ally: foeName, enemy: "Brock", source: "explicit-defense" });
    // Os dois lados deixaram de ser espelhos um do outro: cada lane vale 50 mais o
    // delta publicado na ficha desse brawler, e as duas fichas podem discordar.
    expect(counteringBlue.score).toBeCloseTo(50 + getMatchupValue("Brock", foeName).total, 6);
    expect(counteredBlue.score).toBeCloseTo(50 + getMatchupValue(foeName, "Brock").total, 6);
    expect(neutral).toMatchObject({ source: "win-rate-inference", score: 50 });
  });

  it("applies probability impact to a literal BrawlScope counter", () => {
    // O adversário é escolhido no catálogo: precisamos de um confronto publicado a
    // favor do azul e desfavorável na ficha do vermelho, para o impacto ficar só
    // de um lado.
    const foeName = rankedBrawlerNames.find((name) =>
      name !== "Brock"
      && getMatchupValue("Brock", name).total > 0
      && getMatchupValue(name, "Brock").total < 0)!;
    const blue = [
      { brawler: "Brock", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 },
    ];
    const red = [
      { brawler: foeName, score: 70, tier: "A" as const, brawlPlanetWinRate: 55 },
    ];
    const estimate = estimateDraftWinProbability(blue, red);
    // Score do confronto = 50 + delta publicado; o impacto é metade do que passa de 50.
    const matchupScore = 50 + getMatchupValue("Brock", foeName).total;
    const impactPoints = Math.round(Math.max(0, matchupScore - 50) * 0.5 * 10) / 10;

    expect(foeName).toBeDefined();
    expect(impactPoints).toBeGreaterThan(0);
    expect(estimate.counterImpacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ team: "blue", attacker: "Brock", defender: foeName, matchupScore, impactPoints }),
    ]));
    expect(estimate.blueCounterImpact).toBe(
      estimate.counterImpacts.filter((impact) => impact.team === "blue").reduce((sum, impact) => sum + impact.impactPoints, 0),
    );
    expect(estimate.redCounterImpact).toBe(
      estimate.counterImpacts.filter((impact) => impact.team === "red").reduce((sum, impact) => sum + impact.impactPoints, 0),
    );
    expect(estimate.blueCounterImpact).toBeCloseTo(impactPoints, 6);
    // O lado vermelho lê o mesmo par na sua própria ficha: delta negativo, Score
    // abaixo de 50, logo nenhum impacto de probabilidade.
    expect(estimate.redCounterImpact).toBe(0);
    expect(estimate.netBlueCounterImpact).toBe(estimate.blueCounterImpact - estimate.redCounterImpact);
  });

  it("normalizes custom steps and falls back when the sequence is empty", () => {
    expect(normalizeScrimSequence([{ kind: "pick", team: "red", label: "old" }])).toEqual([{ kind: "pick", team: "red", label: "Pick" }]);
    expect(normalizeScrimSequence([])).toHaveLength(12);
  });

  it("excludes banned brawlers from subsequent pick pools following competitive ranked rules", () => {
    const steps = [{ kind: "ban", team: "blue", label: "Ban" }, { kind: "pick", team: "red", label: "Pick" }] as const;
    const choices = ["Belle", null];
    // In competitive ranked (Power League / Ranked), a banned brawler is excluded from the pick pool.
    expect(getDraftLockedNames([...steps], choices, 1).has("Belle")).toBe(true);
    expect(draftSignalBonuses).toMatchObject({ counter: 0, missingMid: 0.12, bannedCounter: 0.04, openingLongRange: 0.05, synergy: 0 });
  });

  it("uses the corrected competitive roles for Surge, Griff, Gale and Gigi", () => {
    expect(inferDraftRole("Surge")).toBe("side");
    expect(inferDraftRole("Griff")).toBe("side");
    expect(inferDraftRole("Gale")).toBe("mid");
    expect(inferDraftRole("Gigi")).toBe("side");

    // Gigi é Lane: com a equipa vazia recebe o Fit de abertura pelo lado, e
    // apenas por um lado — nunca os dois Fits ao mesmo tempo.
    const gigi = calculateDraftSignal({ brawler: "Gigi", score: 70, tier: "A" as const }, { allyRows: [], enemyRows: [] });
    expect(gigi.scoreBreakdown.missingMidPoints).toBe(0);
    expect(gigi.scoreBreakdown.missingSidePoints).toBeGreaterThan(0);
    expect(gigi.draftScore).toBeGreaterThan(70);
  });

  it("moves the requested additional brawlers to Flex while keeping Lane assignments", () => {
    for (const brawler of ["Ruffs", "Larry & Lawrie", "Spike", "Moe", "Mina"]) {
      expect(inferDraftRole(brawler)).toBe("flex");
    }
    for (const brawler of ["Ollie", "Nita", "Trunk", "Crow"]) {
      expect(inferDraftRole(brawler)).toBe("side");
    }
  });

  it("keeps 8-Bit and Janet in Mid while moving Eve and Tara to Flex", () => {
    for (const brawler of ["8-Bit", "Janet"]) {
      expect(inferDraftRole(brawler)).toBe("mid");
    }
    for (const brawler of ["Eve", "Tara"]) {
      expect(inferDraftRole(brawler)).toBe("flex");
    }
    for (const brawler of ["Bolt", "Damian", "Pearl", "Stu"]) {
      expect(inferDraftRole(brawler)).toBe("side");
    }
  });

  it("keeps Gale in Mid and moves Maisie to Flex", () => {
    expect(inferDraftRole("Gale")).toBe("mid");
    expect(inferDraftRole("Maisie")).toBe("flex");
  });

  it("moves the requested former Mid brawlers to Flex without moving Gale", () => {
    for (const brawler of ["Eve", "Larry & Lawrie", "Sprout", "Colt", "Lola"]) {
      expect(inferDraftRole(brawler)).toBe("flex");
    }
    expect(inferDraftRole("Gale")).toBe("mid");
  });

  it("keeps the requested Mid and Lane brawlers while assigning the remaining corrections to Flex", () => {
    for (const brawler of ["Squeak", "Max", "Lou", "Jessie"]) {
      expect(inferDraftRole(brawler)).toBe("mid");
    }
    for (const brawler of ["Otis", "Ruffs", "Spike", "Juju", "Mina", "Dynamike"]) {
      expect(inferDraftRole(brawler)).toBe("flex");
    }
    for (const brawler of ["Gigi", "Nori", "Alli", "Kaze"]) {
      expect(inferDraftRole(brawler)).toBe("side");
    }
  });

  it("keeps Gray in Mid, Melodie in Lane and Colt in Flex", () => {
    for (const brawler of ["Gray"]) {
      expect(inferDraftRole(brawler)).toBe("mid");
    }
    expect(inferDraftRole("Colt")).toBe("flex");
  });

  it("uses the requested Lane and Mid corrections for Shade, Rico, Gale, Starr Nova, 8-Bit and Cordelius", () => {
    expect(inferDraftRole("Starr Nova")).toBe("side");
    for (const brawler of ["Gale", "8-Bit"]) {
      expect(inferDraftRole(brawler)).toBe("mid");
    }
  });

  it("keeps all newly confirmed Mid brawlers separate from Flex and Lane", () => {
    for (const brawler of ["8-Bit", "Mr. P", "Poco", "Penny", "Bea", "Pierce", "Chuck"]) {
      expect(inferDraftRole(brawler)).toBe("mid");
    }
    for (const brawler of ["Eve", "Juju", "Larry & Lawrie", "Sprout", "Colt", "Mina", "Dynamike", "Lola", "Otis", "Ruffs", "Moe", "Spike", "Tara", "Maisie"]) {
      expect(inferDraftRole(brawler)).toBe("flex");
    }
  });

  it("audits the complete official class catalog and isolates Tanks from allied Marksmen", () => {
    const validClasses = new Set(officialBrawlerClasses);

    expect(Object.keys(brawlerClassCatalog)).toHaveLength(106);
    expect(officialBrawlerClasses).toEqual(["Destruidor", "Tank", "Artilheiro", "Lançador", "Assassino", "Controlador", "Suporte"]);
    expect(Object.values(brawlerClassCatalog).every((brawlerClass) => validClasses.has(brawlerClass))).toBe(true);
    expect(getBrawlerClass("Bolt")).toBe("Tank");
    expect(getBrawlerClass("Ash")).toBe("Tank");
    expect(getBrawlerClass("Bibi")).toBe("Tank");
    expect(getBrawlerClass("Carl")).toBe("Destruidor");
    expect(getBrawlerClass("Sam")).toBe("Tank");
    expect(getBrawlerClass("Bea")).toBe("Artilheiro");
    expect(getBrawlerClass("Piper")).toBe("Artilheiro");
    expect(getBrawlerClass("Colt")).toBe("Destruidor");
    expect(getBrawlerClass("8-Bit")).toBe("Destruidor");

    const beaWithBolt = calculateDraftSignal(
      { brawler: "Bea", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 },
      { allyRows: [{ brawler: "Bolt", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 }], enemyRows: [] },
    );
    expect(beaWithBolt.scoreBreakdown.sameClassPenaltyPoints).toBe(0);
    expect(beaWithBolt.bonusSources.sameClassPenalties).toEqual([]);
  });

  it("applies the same-class penalty between Colt and 8-Bit as verified Damage Dealers", () => {
    const coltWith8Bit = calculateDraftSignal(
      { brawler: "Colt", score: 75, tier: "S" as const, brawlPlanetWinRate: 55 },
      { allyRows: [{ brawler: "8-Bit", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 }], enemyRows: [] },
    );

    expect(coltWith8Bit.scoreBreakdown.sameClassPenaltyPoints).toBeCloseTo(7.5, 6);
    expect(coltWith8Bit.bonusSources.sameClassClass).toBe("Destruidor");
    expect(coltWith8Bit.bonusSources.sameClassPenalties).toEqual(["8-Bit"]);
  });

  it("ranks Uso Médio Híbrido from stable map data without reading draft locks or contextual bonuses", () => {
    const rows = [
      { brawler: "Brock", score: 69, tier: "A" as const, usage: 12 },
      { brawler: "Belle", score: 78, tier: "S" as const, topBrawlUseRate: 20, brawlPlanetPickRate: 16 },
      { brawler: "Ash", score: 82, tier: "S" as const, usage: 20 },
    ];
    const ranked = rankHybridUsageRows(rows);

    expect(ranked.map(({ row, rank }) => `${rank}:${row.brawler}`)).toEqual(["1:Ash", "2:Belle", "3:Brock"]);
    expect(ranked[1].usage).toBe(18);
    expect(ranked[0].row).toBe(rows[2]);
  });

  it("applies the gradual Counter bonus only to literal BrawlScope counter relationships", () => {
    const candidates = [
      { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 55 },
      { brawler: "Bibi", score: 85, tier: "S" as const, brawlPlanetWinRate: 55 },
    ];
    const enemy = [{ brawler: getCounterProfile("Brock").counters[0]!, score: 70, tier: "A" as const, brawlPlanetWinRate: 55 }];
    const withoutEnemy = rankCounterRows(candidates, [], new Set()).map((row) => row.brawler);
    const againstCounteredPick = rankCounterRows(candidates, enemy, new Set()).map((row) => row.brawler);
    const neutralCounter = calculateDraftSignal(candidates[0], { enemyRows: [] }).counter;
    const literalCounter = calculateDraftSignal(candidates[0], { enemyRows: enemy }).counter;
    expect(withoutEnemy).toEqual(["Bibi", "Brock"]);
    expect(againstCounteredPick).toEqual(["Bibi", "Brock"]);
    expect(neutralCounter).toBeNull();
    // O sinal de Counter é a média dos Scores dos confrontos ativos, e cada Score
    // é 50 mais o delta publicado para o par.
    expect(literalCounter).toBeCloseTo(50 + getMatchupValue("Brock", enemy[0].brawler).total, 6);
    expect(calculateDraftSignal(candidates[0], { enemyRows: enemy }).scoreBreakdown.counterPoints)
      .toBeCloseTo(expectedCounterPoints(69, "Brock", [enemy[0].brawler]), 6);
  });

  it("uses the BrawlScope direction once, never as counter bonus and enemy-counter penalty", () => {
    const brock = { brawler: "Brock", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 };
    const bea = { brawler: "Bea", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 };
    const signal = calculateDraftSignal(brock, { enemyRows: [bea] });
    const profile = getCounterProfile("Brock", ["Brock", "Bea"]);

    // BrawlScope publica Brock → Bea. Outras fontes continuam visíveis, mas não
    // podem duplicar o mesmo confronto em bónus e penalização simultaneamente.
    expect(profile.counters).toContain("Bea");
    expect(profile.counteredBy).not.toContain("Bea");
    expect(signal.scoreBreakdown.counterPoints).toBeCloseTo(expectedCounterPoints(70, "Brock", ["Bea"]), 6);
    expect(signal.scoreBreakdown.counterPoints).toBeGreaterThan(0);
    expect(signal.scoreBreakdown.enemyCounterPenaltyPoints).toBe(0);
    expect(signal.bonusSources.counterTargets).toContain("Bea");
    expect(signal.bonusSources.enemyCounters).not.toContain("Bea");
  });

  it("stacks the gradual Counter rate once for each literal enemy matchup on the first team pick", () => {
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const twoCounteredEnemies = getCounterProfile(row.brawler).counters.slice(0, 2)
      .map((brawler) => ({ brawler, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }));
    const signal = calculateDraftSignal(row, { enemyRows: twoCounteredEnemies });

    expect(signal.counterMatchups).toHaveLength(2);
    expect(signal.scoreBreakdown.counterPoints)
      .toBeCloseTo(expectedCounterPoints(69, row.brawler, twoCounteredEnemies.map((enemy) => enemy.brawler)), 6);
    // O rótulo indica os dois confrontos e a origem do valor; a percentagem em si
    // vem dos dados e por isso não é fixada aqui.
    expect(signal.scoreBreakdown.activeBonuses.some((bonus) => /^Counter [+-]?[\d,.]+% \(2 matchups · delta BrawlScope\)$/.test(bonus))).toBe(true);
  });

  it("removes only a redundant single Counter bonus while preserving double and triple coverage", () => {
    const brock = { brawler: "Brock", score: 76, tier: "A" as const, brawlPlanetWinRate: 55 };
    const angelo = { brawler: "Angelo", score: 80, tier: "S" as const, brawlPlanetWinRate: 56 };
    const bea = { brawler: "Bea", score: 70, tier: "A" as const, brawlPlanetWinRate: 53 };
    const gene = { brawler: "Gene", score: 70, tier: "A" as const, brawlPlanetWinRate: 53 };
    const pam = { brawler: "Pam", score: 70, tier: "A" as const, brawlPlanetWinRate: 53 };

    // Brock countera Bea e Gene: mantém o bónus duplo, ainda que Bea já
    // esteja coberta, porque a recomendação responde a vários inimigos ativos.
    // Os pontos passaram a ser a soma dos deltas publicados dos dois confrontos.
    const doubleCoverage = calculateDraftSignal(brock, { allyRows: [angelo], enemyRows: [bea, gene], pickNumber: 1 });
    expect(doubleCoverage.counterMatchups).toHaveLength(2);
    expect(doubleCoverage.bonusSources.counterBonusTargets).toEqual(["Bea", "Gene"]);
    expect(doubleCoverage.scoreBreakdown.counterPoints)
      .toBeCloseTo(expectedCounterPoints(doubleCoverage.scoreBreakdown.hybridPoints, "Brock", ["Bea", "Gene"]), 6);
    expect(doubleCoverage.scoreBreakdown.activeBonuses).toContain(expectedCounterBonusLabel("Brock", ["Bea", "Gene"]));

    // A mesma regra mantém a cobertura tripla completa.
    const tripleCoverage = calculateDraftSignal(brock, { allyRows: [angelo], enemyRows: [bea, gene, pam], pickNumber: 1 });
    expect(tripleCoverage.counterMatchups).toHaveLength(3);
    expect(tripleCoverage.bonusSources.counterBonusTargets).toEqual(["Bea", "Gene", "Pam"]);
    expect(tripleCoverage.scoreBreakdown.counterPoints)
      .toBeCloseTo(expectedCounterPoints(tripleCoverage.scoreBreakdown.hybridPoints, "Brock", ["Bea", "Gene", "Pam"]), 6);
    expect(tripleCoverage.scoreBreakdown.activeBonuses).toContain(expectedCounterBonusLabel("Brock", ["Bea", "Gene", "Pam"]));

    // Angelo já countera Bea; Brock também. Na era da taxa fixa isto era pagar
    // duas vezes pela mesma resposta e o segundo Counter era suprimido. Com o
    // delta publicado deixou de ser: o delta é a vantagem medida daquele par, e
    // Brock continua a tê-la contra Bea quer o Angelo esteja no time quer não.
    // O que se mantém é a informação — a cobertura aparece na auditoria — mas já
    // não desconta pontos, e a auditoria deixou de anunciar uma supressão que o
    // Score não aplicava.
    const redundantSingle = calculateDraftSignal(brock, { allyRows: [angelo], enemyRows: [bea], pickNumber: 1 });
    expect(redundantSingle.counterMatchups.map((matchup) => matchup.defender)).toEqual(["Bea"]);
    expect(redundantSingle.bonusSources.coveredCounterTargets).toEqual([{ enemy: "Bea", allies: ["Angelo"] }]);
    expect(redundantSingle.bonusSources.counterBonusTargets).toEqual(["Bea"]);
    expect(redundantSingle.scoreBreakdown.counterPoints)
      .toBeCloseTo(expectedCounterPoints(redundantSingle.scoreBreakdown.hybridPoints, "Brock", ["Bea"]), 6);
    // A frase de auditoria continua a existir, agora como informação e não como
    // corte — e passou a dizer qual dos dois casos está à frente, porque com a
    // regra opcional "resposta já coberta" ligada o bónus é mesmo retirado.
    expect(redundantSingle.scoreBreakdown.activeBonuses)
      .toContain("Resposta já coberta · bónus mantido (Bea também counterado por Angelo)");
    expect(redundantSingle.bonusSources.suppressedCounterTargets).toEqual([]);
  });

  it("keeps every literal Counter Top relation as a pre-pick risk without changing the score", () => {
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const counters = getCounterProfile("Brock").counteredBy.slice(0, 2);
    expect(counters).toHaveLength(2);

    const baseline = calculateDraftSignal(row, { allyRows: [], enemyRows: [], isCandidateUnselected: true });
    const withTopTwentyCounters = calculateDraftSignal(row, {
      allyRows: [],
      enemyRows: [],
      isCandidateUnselected: true,
      topRecommendationNames: [row.brawler, ...counters],
    });
	
	    expect(withTopTwentyCounters.bonusSources.topTwentyCounters).toEqual(counters);
	    expect(draftSignalBonuses.topTwentyCounterPenalty).toBe(defaultDraftRuleSettings.topCounterPenalty);
	    expect(withTopTwentyCounters.scoreBreakdown.topTwentyCounterPenaltyPoints).toBe(0);
    expect(withTopTwentyCounters.draftScore).toBeCloseTo(baseline.draftScore, 6);
  });

  it("counts all ten literal BrawlScope counters of Bolt when they are inside the active Counter Top window", () => {
    const bolt = { brawler: "Bolt", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const publishedBoltCounters = brawlScopeCounterData.bolt.counteredBy;
    expect(publishedBoltCounters).toHaveLength(10);

    const signal = calculateDraftSignal(bolt, {
      allyRows: [],
      enemyRows: [],
      isCandidateUnselected: true,
      topRecommendationNames: [bolt.brawler, ...publishedBoltCounters],
    });

    expect(signal.bonusSources.topTwentyCounters).toEqual(publishedBoltCounters);
    expect(signal.scoreBreakdown.topTwentyCounterPenaltyPoints).toBe(0);
  });

  // O par deixou de ser fixo: os catálogos BrawlScope foram reimportados, por isso
  // o counter é procurado na ficha publicada do Bolt e tem de passar também pelo
  // delta do próprio Bolt, que é o que o motor exige hoje.
  it("applies Counter Top to a published counter of Bolt that is inside the active window", () => {
    const bolt = { brawler: "Bolt", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const counter = brawlScopeCounterData.bolt.counteredBy
      .find((name) => getMatchupValue(bolt.brawler, name).total < 0)!;

    expect(counter).toBeDefined();
    expect(getLiteralCounterRelations(counter, bolt.brawler).length).toBeGreaterThan(0);

    const signal = calculateDraftSignal(bolt, {
      allyRows: [],
      enemyRows: [],
      isCandidateUnselected: true,
      completedPickCount: 0,
      topRecommendationNames: [counter],
      counterPenaltyEligibleNames: [counter],
    });

    expect(signal.bonusSources.topTwentyCounters).toEqual([counter]);
    expect(signal.scoreBreakdown.topTwentyCounterPenaltyPoints).toBe(0);
  });

  it("does not apply a published counter of Bolt as Counter Top when it is outside the active window", () => {
    const bolt = { brawler: "Bolt", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const eligible = brawlScopeCounterData.bolt.counteredBy
      .filter((name) => getMatchupValue(bolt.brawler, name).total < 0);
    const [inWindow, outOfWindow] = eligible;

    expect(eligible.length).toBeGreaterThanOrEqual(2);

    const signal = calculateDraftSignal(bolt, {
      allyRows: [],
      enemyRows: [],
      isCandidateUnselected: true,
      completedPickCount: 0,
      topRecommendationNames: [inWindow],
      counterPenaltyEligibleNames: [inWindow],
    });

    expect(signal.bonusSources.topTwentyCounters).not.toContain(outOfWindow);
    expect(signal.bonusSources.topTwentyCounters).toEqual([inWindow]);
  });

  it("keeps every literal BrawlScope counter inside Counter Top when that counter is in the active window", () => {
    const catalogueByLowerName = new Map(
      allRankedRows.map((row) => [row.brawler.toLocaleLowerCase("pt-PT"), row]),
    );
    let auditedProfiles = 0;
    let auditedCounters = 0;

    for (const [slug, profile] of Object.entries(brawlScopeCounterData)) {
      // Ruffs é a exceção conhecida: as listas brutas da fonte exigem inversão
      // no adaptador e são validadas separadamente pela direção canónica.
      if (slug === "ruffs") continue;
      const candidate = catalogueByLowerName.get(slug);
      // Counter Top só pode mostrar brawlers presentes no Ranked; um perfil
      // publicado sem linha disponível não é materializado nem inventado aqui.
      if (!candidate) continue;
      auditedProfiles += 1;

      const signal = calculateDraftSignal(candidate, {
        allyRows: [],
        enemyRows: [],
        isCandidateUnselected: true,
        completedPickCount: 0,
        topRecommendationNames: profile.counteredBy,
      });

      // A ficha do candidato tem a última palavra: um counter publicado na página
      // do adversário deixa de entrar no Counter Top quando o delta do próprio
      // candidato mostra o confronto como favorável.
      const expectedCounters = profile.counteredBy
        .filter((counter) => getMatchupValue(candidate.brawler, counter).total < 0);
      auditedCounters += expectedCounters.length;

      expect(
        signal.bonusSources.topTwentyCounters.map((counter) => counter.toLocaleLowerCase("pt-PT")),
        `Counter Top omitiu counter literal de ${candidate.brawler}`,
      ).toEqual(expectedCounters.map((counter) => counter.toLocaleLowerCase("pt-PT")));
    }

    expect(auditedProfiles).toBeGreaterThan(90);
    // Sem isto o teste passaria com o catálogo vazio de confrontos desfavoráveis.
    expect(auditedCounters).toBeGreaterThan(auditedProfiles);
  });

  it("starts at Top 20 and reduces the counter window by four after every completed pick", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((completedPicks) => getTopCounterWindowSize(undefined, completedPicks))).toEqual([20, 16, 12, 8, 4, 0, 0]);

    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const counters = getCounterProfile("Brock").counteredBy.slice(0, 2);
    const pickSix = calculateDraftSignal(row, { completedPickCount: 6, topRecommendationNames: counters });

    expect(pickSix.scoreBreakdown.topCounterWindowSize).toBe(0);
    expect(pickSix.scoreBreakdown.topTwentyCounterPenaltyPoints).toBe(0);
    expect(pickSix.bonusSources.topTwentyCounters).toEqual([]);
    expect(getDraftTopRecommendationNames([row], new Set(), "", { completedPickCount: 6 })).toEqual([]);
  });

  it("does not reuse a Top 20 counter after the contextual Top 16 is recalculated", () => {
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const oldTopTwentyCounter = getCounterProfile(row.brawler).counteredBy[0];
    expect(oldTopTwentyCounter).toBeDefined();

    const staleTopTwenty = calculateDraftSignal(row, {
      completedPickCount: 1,
      isCandidateUnselected: true,
      topRecommendationNames: [row.brawler, oldTopTwentyCounter!],
    });
    const recalculatedTopSixteen = rankDraftEntries([row], new Set(), "", "Todos", {
      completedPickCount: 1,
      topRecommendationNames: [],
    })[0];
    const noCounterInTopSixteen = calculateDraftSignal(row, {
      completedPickCount: 1,
      isCandidateUnselected: true,
      topRecommendationNames: [row.brawler],
    });

    expect(staleTopTwenty.scoreBreakdown.topTwentyCounterPenaltyPoints).toBe(0);
    expect(recalculatedTopSixteen.draftScore).toBeCloseTo(noCounterInTopSixteen.draftScore, 6);
    expect(recalculatedTopSixteen.draftScore).toBeCloseTo(staleTopTwenty.draftScore, 6);
  });

	  it("applies the configured escalating pressure when the same enemy already counters one or two allied picks", () => {
    const candidate = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const pressureEnemy = getCounterProfile(candidate.brawler).counteredBy.find((enemy) =>
      getCounterProfile(enemy).counters.filter((target) => target !== candidate.brawler).length >= 2,
    );
    expect(pressureEnemy).toBeDefined();
    const pressureAllies = getCounterProfile(pressureEnemy!).counters
      .filter((target) => target !== candidate.brawler)
      .slice(0, 2)
      .map((brawler) => ({ brawler, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }));
    const enemy = { brawler: pressureEnemy!, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 };
    const oneCounteredAlly = calculateDraftSignal(candidate, { allyRows: pressureAllies.slice(0, 1), enemyRows: [enemy], isCandidateUnselected: true, topRecommendationNames: [candidate.brawler] });
    const twoCounteredAllies = calculateDraftSignal(candidate, { allyRows: pressureAllies, enemyRows: [enemy], isCandidateUnselected: true, topRecommendationNames: [candidate.brawler] });

	    expect(oneCounteredAlly.scoreBreakdown.repeatedEnemyCounterPressurePoints).toBeCloseTo(
	      oneCounteredAlly.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.repeatedEnemyCounterPressure,
	      6,
	    );
	    expect(oneCounteredAlly.bonusSources.repeatedEnemyCounterPressures).toEqual([
	      { enemy: pressureEnemy, counteredAllies: [pressureAllies[0].brawler], rate: defaultDraftRuleSettings.repeatedEnemyCounterPressure },
	    ]);
	    expect(twoCounteredAllies.scoreBreakdown.repeatedEnemyCounterPressurePoints).toBeCloseTo(
	      twoCounteredAllies.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.repeatedEnemyCounterPressure * 2,
	      6,
	    );
	    expect(twoCounteredAllies.bonusSources.repeatedEnemyCounterPressures).toEqual([
	      { enemy: pressureEnemy, counteredAllies: pressureAllies.map((ally) => ally.brawler), rate: defaultDraftRuleSettings.repeatedEnemyCounterPressure * 2 },
	    ]);
  });

  it("keeps Enemy Counter direto e Pressão Inimiga fora do Top, limitando somente os counters de Counter Top", () => {
    const candidate = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const pressureEnemy = getCounterProfile(candidate.brawler).counteredBy.find((enemy) =>
      getMatchupValue(candidate.brawler, enemy).total < 0
      && getCounterProfile(enemy).counters.some((target) => target !== candidate.brawler),
    );
    expect(pressureEnemy).toBeDefined();
    const counteredAlly = getCounterProfile(pressureEnemy!).counters.find((target) => target !== candidate.brawler)!;
    const signal = calculateDraftSignal(candidate, {
      allyRows: [{ brawler: counteredAlly, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }],
      enemyRows: [{ brawler: pressureEnemy!, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }],
      completedPickCount: 1,
      isCandidateUnselected: true,
      topRecommendationNames: ["Shelly"],
    });
	
	    expect(signal.scoreBreakdown.topCounterWindowSize).toBe(16);
	    // O desbónus separado de Enemy Counter está desligado de propósito: o mesmo
	    // confronto já desconta pontos pelo delta negativo do Counter, e somar os
	    // dois contaria o matchup duas vezes. A Pressão Inimiga continua a aplicar-se.
	    expect(signal.scoreBreakdown.enemyCounterPenaltyPoints).toBe(0);
	    expect(signal.scoreBreakdown.counterPoints)
	      .toBeCloseTo(expectedCounterPoints(signal.scoreBreakdown.hybridPoints, candidate.brawler, [pressureEnemy!]), 6);
	    expect(signal.scoreBreakdown.counterPoints).toBeLessThan(0);
	    expect(signal.scoreBreakdown.repeatedEnemyCounterPressurePoints).toBeCloseTo(
	      signal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.repeatedEnemyCounterPressure,
	      6,
	    );
	    expect(signal.scoreBreakdown.topTwentyCounterPenaltyPoints).toBe(0);
	    expect(signal.bonusSources.enemyCounters).toEqual([pressureEnemy]);
	    expect(signal.bonusSources.repeatedEnemyCounterPressures).toEqual([
	      { enemy: pressureEnemy, counteredAllies: [counteredAlly], rate: defaultDraftRuleSettings.repeatedEnemyCounterPressure },
	    ]);
    expect(signal.bonusSources.topTwentyCounters).toEqual([]);
  });

  it("keeps Enemy Counter pressure for a candidate in the visible Top even when Counter Top is safely ineligible", () => {
    const candidate = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const pressureEnemy = getCounterProfile(candidate.brawler).counteredBy.find((enemy) =>
      getMatchupValue(candidate.brawler, enemy).total < 0
      && getCounterProfile(enemy).counters.some((target) => target !== candidate.brawler),
    );
    expect(pressureEnemy).toBeDefined();
    const counteredAlly = getCounterProfile(pressureEnemy!).counters.find((target) => target !== candidate.brawler)!;
    const signal = calculateDraftSignal(candidate, {
      allyRows: [{ brawler: counteredAlly, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }],
      enemyRows: [{ brawler: pressureEnemy!, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }],
      isCandidateUnselected: true,
      topRecommendationNames: [candidate.brawler],
      counterPenaltyEligibleNames: [],
    });
	
	    expect(signal.scoreBreakdown.repeatedEnemyCounterPressurePoints).toBeGreaterThan(0);
	    expect(signal.scoreBreakdown.topTwentyCounterPenaltyPoints).toBe(0);
	    expect(signal.bonusSources.repeatedEnemyCounterPressures).toEqual([
	      { enemy: pressureEnemy, counteredAllies: [counteredAlly], rate: defaultDraftRuleSettings.repeatedEnemyCounterPressure },
	    ]);
  });

  it("mantém o risco literal de Glowy na auditoria sem aplicar penalização antes de picks", () => {
    const glowy = { brawler: "Glowy", score: 32, tier: "B" as const, brawlPlanetWinRate: 32, topBrawlScore: 4 };
    // Os dois adversários são procurados no catálogo em vez de fixados: um com
    // delta desfavorável (é o que gera Enemy Counter) e outro com relação literal
    // publicada contra a Glowy, que é o requisito extra do Counter Top.
    const enemyCounterName = getCounterProfile("Glowy").counteredBy
      .find((name) => getMatchupValue("Glowy", name).total < 0)!;
    const literalCounterName = rankedBrawlerNames.find((name) =>
      name !== "Glowy"
      && getMatchupValue("Glowy", name).total < 0
      && getLiteralCounterRelations(name, "Glowy").length > 0)!;
    const neutralName = rankedBrawlerNames.find((name) => name !== "Glowy" && name !== enemyCounterName)!;
    const fillerRows = allRankedRows
      .filter((row) => !["Glowy", neutralName, enemyCounterName].includes(row.brawler))
      .slice(0, 20)
      .map((row, index) => ({ ...row, score: 90 - index * 0.4, brawlPlanetWinRate: 90 - index * 0.4, topBrawlScore: 12 }));
    const neutral = { brawler: neutralName, score: 84, tier: "S" as const, brawlPlanetWinRate: 84, topBrawlScore: 12 };
    const enemyCounter = { brawler: enemyCounterName, score: 83, tier: "S" as const, brawlPlanetWinRate: 83, topBrawlScore: 12 };
    const rows = [...fillerRows, glowy, neutral, enemyCounter];
    const context = { completedPickCount: 1, enemyRows: [neutral, enemyCounter] };
    const activeTopSixteen = getDraftTopRecommendationNames(rows, new Set(), "", context);
    const glowyEntry = rankDraftEntries(rows, new Set(), "", "Todos", context).find((entry) => entry.row.brawler === "Glowy");
    const glowyWithCounterInWindow = calculateDraftSignal(glowy, {
      ...context,
      topRecommendationNames: [literalCounterName],
      counterPenaltyEligibleNames: [literalCounterName],
    });

    expect(enemyCounterName).toBeDefined();
    expect(literalCounterName).toBeDefined();
    expect(activeTopSixteen).toHaveLength(16);
    expect(activeTopSixteen).not.toContain("Glowy");
    expect(glowyEntry).toBeDefined();
    expect(glowyEntry!.rank).toBeGreaterThan(17);
    // Dois confrontos desfavoráveis acrescentam a pressão configurada.
    expect(glowyEntry!.signal.scoreBreakdown.enemyCounterPenaltyPoints).toBeCloseTo(glowyEntry!.signal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.repeatedEnemyCounterPressure);
    expect(glowyEntry!.signal.scoreBreakdown.counterPoints).toBeCloseTo(
      expectedCounterPoints(glowyEntry!.signal.scoreBreakdown.hybridPoints, "Glowy", [neutralName, enemyCounterName]),
      6,
    );
    expect(glowyEntry!.signal.scoreBreakdown.repeatedEnemyCounterPressurePoints).toBe(0);
    expect(glowyEntry!.signal.bonusSources.enemyCounters).toContain(enemyCounterName);
    // Counter Top continua a listar o risco literal, mas sem tirar pontos.
    expect(glowyWithCounterInWindow.scoreBreakdown.topTwentyCounterPenaltyPoints).toBe(0);
    expect(glowyWithCounterInWindow.bonusSources.topTwentyCounters).toContain(literalCounterName);
  });

  it("does not let a search for Glowy rebuild the global Counter Top window around her", () => {
    const glowy = { brawler: "Glowy", score: 20, tier: "B" as const, brawlPlanetWinRate: 20, topBrawlScore: 2 };
    const fillers = allRankedRows
      .filter((row) => row.brawler !== "Glowy")
      .slice(0, 24)
      .map((row, index) => ({ ...row, score: 95 - index, brawlPlanetWinRate: 95 - index, topBrawlScore: 12 }));
    const rows = [...fillers, glowy];
    const globalTop = getDraftTopRecommendationNames(rows, new Set(), "glo", { completedPickCount: 0 });
    const unfilteredGlowy = rankDraftEntries(rows, new Set(), "", "Todos", { completedPickCount: 0 })
      .find((entry) => entry.row.brawler === "Glowy")!;
    const searchedGlowy = rankDraftEntries(rows, new Set(), "glo", "Todos", { completedPickCount: 0 })[0];

    expect(globalTop).toHaveLength(20);
    expect(globalTop).not.toContain("Glowy");
    expect(searchedGlowy.row.brawler).toBe("Glowy");
    expect(searchedGlowy.signal.scoreBreakdown.topTwentyCounterPenaltyPoints)
      .toBeCloseTo(unfilteredGlowy.signal.scoreBreakdown.topTwentyCounterPenaltyPoints, 6);
    expect(searchedGlowy.signal.bonusSources.topTwentyCounters)
      .toEqual(unfilteredGlowy.signal.bonusSources.topTwentyCounters);
  });

  it("usa apenas counters da janela ativa para Counter Top em todo o catálogo, sem limitar o candidato alvo", () => {
    const catalogue = Array.from(new Map(allRankedRows.map((row) => [row.brawler, row])).values());

    for (let completedPickCount = 0; completedPickCount <= 6; completedPickCount += 1) {
      const enemy = catalogue[(completedPickCount + 1) % catalogue.length];
      const ally = catalogue[(completedPickCount + 17) % catalogue.length];
      const lockedNames = new Set([enemy.brawler, ally.brawler]);
      const context = {
        completedPickCount,
        allyRows: [ally],
        enemyRows: [enemy],
      };
      const activeCounterWindow = getDraftCounterWindow(catalogue, lockedNames, "", context);
      const activeWindow = activeCounterWindow.topRecommendationNames;
      const entries = rankDraftEntries(catalogue, lockedNames, "", "Todos", {
        ...context,
        ...activeCounterWindow,
      });
      const windowSize = getTopCounterWindowSize(undefined, completedPickCount);
      const activeKeys = new Set(activeCounterWindow.counterPenaltyEligibleNames.map((name) => name.toLowerCase()));

      expect(activeWindow).toHaveLength(Math.min(windowSize, entries.length));
      expect(activeCounterWindow.counterPenaltyEligibleNames).toEqual(activeWindow);
      for (const entry of entries) {
        const expectedCounters = activeWindow.filter((counter) =>
          counter.toLowerCase() !== entry.row.brawler.toLowerCase()
          // A ficha do candidato decide: sem delta desfavorável, a relação literal
          // publicada do outro lado não entra no Counter Top.
          && getMatchupValue(entry.row.brawler, counter).total < 0
          && getLiteralCounterRelations(counter, entry.row.brawler).length > 0,
        );
        expect(
          entry.signal.bonusSources.topTwentyCounters,
          `${entry.row.brawler} tem de listar todos os counters literais da janela no pick ${completedPickCount}`,
        ).toEqual(expectedCounters);
      }
    }
  });

  // Os três counters deixaram de ser fixos (Surge/Rosa/Damian era o catálogo da
  // época passada): são procurados entre os brawlers de Gem Fort que cumprem hoje
  // as duas condições do Counter Top — relação literal publicada contra o Bolt e
  // delta desfavorável na própria ficha do Bolt.
  it("inclui no Counter Top do Bolt os counters publicados que aparecem no Top ativo de Gem Fort", () => {
    const mapRows = allRankedRows.filter((row) => row.map === "Gem Fort");
    const highlighted = mapRows
      .map((row) => row.brawler)
      .filter((name) => name !== "Bolt"
        && getMatchupValue("Bolt", name, "gem-grab").total < 0
        && getLiteralCounterRelations(name, "Bolt", "gem-grab").length > 0)
      .slice(0, 3);
    const highlightedCounters = new Set(highlighted);
    const rows = mapRows
      .map((row) => highlightedCounters.has(row.brawler)
        ? { ...row, score: 99, brawlPlanetWinRate: 99, topBrawlScore: 13 }
        : { ...row, score: 1, brawlPlanetWinRate: 1, topBrawlScore: 0 });
    const lockedNames = new Set<string>();
    const context = { pickNumber: 3, completedPickCount: 2, mapModeId: "gem-grab" };
    const counterWindow = getDraftCounterWindow(rows, lockedNames, "", context);
    const bolt = rows.find((row) => row.brawler === "Bolt")!;
    const signal = calculateDraftSignal(bolt, { ...context, ...counterWindow });

    expect(highlighted).toHaveLength(3);
    expect(counterWindow.topRecommendationNames).toEqual(expect.arrayContaining(highlighted));
    expect(counterWindow.counterPenaltyEligibleNames).toEqual(counterWindow.topRecommendationNames);
    expect(signal.bonusSources.topTwentyCounters).toEqual(expect.arrayContaining(highlighted));
  });

  it("keeps the configured Enemy Counter pressure for candidates mesmo depois de fechar Counter Top", () => {
    const candidate = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const pressureEnemy = getCounterProfile(candidate.brawler).counteredBy.find((enemy) =>
      getCounterProfile(enemy).counters.filter((target) => target !== candidate.brawler).length >= 2,
    );
    expect(pressureEnemy).toBeDefined();
    const counteredAllies = getCounterProfile(pressureEnemy!).counters
      .filter((target) => target !== candidate.brawler)
      .slice(0, 2)
      .map((brawler) => ({ brawler, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }));
    const enemy = { brawler: pressureEnemy!, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 };

    for (let completedPickCount = 0; completedPickCount <= 5; completedPickCount += 1) {
      const entry = rankDraftEntries([candidate], new Set(), "", "Todos", {
        completedPickCount,
        allyRows: counteredAllies,
        enemyRows: [enemy],
      })[0];
      expect(entry.signal.scoreBreakdown.topCounterWindowSize).toBe(getTopCounterWindowSize(undefined, completedPickCount));
      expect(entry.signal.scoreBreakdown.repeatedEnemyCounterPressurePoints, `pressão ausente no pick ${completedPickCount}`).toBeCloseTo(
        entry.signal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.repeatedEnemyCounterPressure * 2,
        6,
      );
      expect(entry.signal.bonusSources.repeatedEnemyCounterPressures).toEqual([
        { enemy: pressureEnemy, counteredAllies: counteredAllies.map((ally) => ally.brawler), rate: defaultDraftRuleSettings.repeatedEnemyCounterPressure * 2 },
      ]);
    }

    const closedWindow = rankDraftEntries([candidate], new Set(), "", "Todos", {
      completedPickCount: 6,
      allyRows: counteredAllies,
      enemyRows: [enemy],
    })[0];
    expect(closedWindow.signal.scoreBreakdown.topCounterWindowSize).toBe(0);
    expect(closedWindow.signal.scoreBreakdown.repeatedEnemyCounterPressurePoints).toBeCloseTo(
      closedWindow.signal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.repeatedEnemyCounterPressure * 2,
      6,
    );
  });

  it("applies the official gradual Counter rate on every global pick", () => {
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const enemyRows = [{ brawler: getCounterProfile(row.brawler).counters[0]!, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }];
    const signals = [1, 2, 3, 4, 5, 6].map((pickNumber) => calculateDraftSignal(row, { enemyRows, pickNumber }));

    const expectedRates = [
      defaultDraftRuleSettings.counterPick1,
      defaultDraftRuleSettings.counterPick2,
      defaultDraftRuleSettings.counterPick3,
      defaultDraftRuleSettings.counterPick4,
      defaultDraftRuleSettings.counterPick5,
      defaultDraftRuleSettings.counterPick6,
    ];
    expect(signals.map((signal) => signal.scoreBreakdown.counterBonusRate)).toEqual(expectedRates);
    // A taxa gradual continua a ser reportada por pick, mas já não é ela que faz
    // os pontos: o Counter passou a valer o delta publicado do confronto, que é o
    // mesmo em qualquer pick.
    signals.forEach((signal) => {
      expect(signal.scoreBreakdown.counterPoints)
        .toBeCloseTo(expectedCounterPoints(signal.scoreBreakdown.hybridPoints, row.brawler, [enemyRows[0].brawler]), 6);
    });
    expect(new Set(signals.map((signal) => signal.scoreBreakdown.counterPoints)).size).toBe(1);
    expect(signals.map((signal) => signal.scoreBreakdown.counterBonusPick)).toEqual([1, 2, 3, 4, 5, 6]);
    expect([1, 2, 3, 4, 5, 6].map(getCounterBonusRate)).toEqual(expectedRates);
  });

  it("applies the official gradual Sinergia rate on every global pick", () => {
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    // O aliado é procurado na ficha publicada, para o teste sobreviver a uma
    // reimportação do catálogo de sinergias.
    const teammate = (getCounterSourceProfiles(row.brawler).find((profile) => profile.source === "BrawlScope")?.bestTeammates ?? [])
      .find((relation) => typeof relation.delta === "number")!;
    const allyRows = [{ brawler: teammate.brawler, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }];
    const signals = [1, 2, 3, 4, 5, 6].map((pickNumber) => calculateDraftSignal(row, { allyRows, pickNumber }));

    const expectedRates = [
      defaultDraftRuleSettings.synergyPick1,
      defaultDraftRuleSettings.synergyPick2,
      defaultDraftRuleSettings.synergyPick3,
      defaultDraftRuleSettings.synergyPick4,
      defaultDraftRuleSettings.synergyPick5,
      defaultDraftRuleSettings.synergyPick6,
    ];
    // A taxa gradual por pick continua a existir, mas passou a ser reportada em
    // configuredSynergyBonusRate: synergyBonusRate mostra agora a taxa EFETIVA, que
    // é a percentagem publicada para o par quando a fonte a publica.
    const publishedRate = teammate.delta! / 100;
    expect(publishedRate).toBeGreaterThan(0);
    expect(signals.map((signal) => signal.scoreBreakdown.configuredSynergyBonusRate)).toEqual(expectedRates);
    expect(signals.map((signal) => signal.scoreBreakdown.hasPublishedSynergyRate)).toEqual([true, true, true, true, true, true]);
    expect(signals.map((signal) => signal.scoreBreakdown.synergyBonusRate)).toEqual(expectedRates.map(() => publishedRate));
    signals.forEach((signal) => {
      expect(signal.scoreBreakdown.synergyPoints).toBeCloseTo(signal.scoreBreakdown.hybridPoints * publishedRate, 6);
    });
    expect([1, 2, 3, 4, 5, 6].map(getSynergyBonusRate)).toEqual(expectedRates);
  });

  it("keeps an auditable pre-pick breakdown for the central duel score-rise view", () => {
    const brock = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const directCounter = getCounterProfile("Brock").counteredBy[0];
    const counterTarget = getCounterProfile("Brock").counters[0]!;
    const signal = calculateDraftSignal(brock, {
      allyRows: [{ brawler: "Pearl", score: 75, tier: "S" as const, brawlPlanetWinRate: 53 }],
      enemyRows: [{ brawler: counterTarget, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }],
      bannedNames: new Set([directCounter]),
      baseHybridTop25Names: new Set([directCounter]),
      pickNumber: 1,
    });
    const pointsFromVisibleBonuses = signal.scoreBreakdown.counterPoints
      + signal.scoreBreakdown.missingMidPoints
      + signal.scoreBreakdown.missingSidePoints
      + signal.scoreBreakdown.banPoints
      + signal.scoreBreakdown.openingLongRangePoints
      + signal.scoreBreakdown.synergyPoints
      - signal.scoreBreakdown.enemyCounterPenaltyPoints
      - signal.scoreBreakdown.sameClassPenaltyPoints
      - signal.scoreBreakdown.worstTeammatePenaltyPoints;

    expect(signal.scoreBreakdown.hybridPoints).toBe(69);
    // Counter e Sinergia deixaram de sair da taxa por pick: valem o delta e a
    // percentagem que a fonte publica para o par. Os restantes bónus não mudaram.
    expect(signal.scoreBreakdown.counterPoints)
      .toBeCloseTo(expectedCounterPoints(signal.scoreBreakdown.hybridPoints, brock.brawler, [counterTarget]), 6);
    expect(signal.scoreBreakdown.missingMidPoints).toBeCloseTo(signal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.missingMid, 6);
    expect(signal.scoreBreakdown.banPoints).toBeCloseTo(signal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.banPick1, 6);
    expect(signal.scoreBreakdown.openingLongRangePoints).toBeCloseTo(signal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.openingLongRange, 6);
    expect(signal.scoreBreakdown.synergyPoints).toBeCloseTo(
      signal.scoreBreakdown.hybridPoints * expectedSynergyRate(brock.brawler, ["Pearl"], defaultDraftRuleSettings.synergyPick1),
      6,
    );
    expect(signal.bonusSources.counterTargets).toEqual([counterTarget]);
    expect(signal.bonusSources.bannedCounters).toEqual([directCounter]);
    expect(signal.bonusSources.synergyAllies).toEqual(["Pearl"]);
    expect(signal.scoreBreakdown.sameClassPenaltyPoints).toBeCloseTo(0, 6);
    expect(pointsFromVisibleBonuses).toBeCloseTo(signal.scoreBreakdown.rawContextualBonusPoints, 6);
    expect(signal.scoreBreakdown.rawContextualPenaltyPoints).toBeCloseTo(0, 6);
    /**
     * O que os chips somam é o que o Score leva.
     *
     * Este cenário era exatamente um dos que o tecto cortava: os fatores visíveis
     * somavam mais de 12% da Base e o ajuste ficava preso nesse valor. A auditoria
     * do cartão dizia uma coisa e o Score fazia outra — que é a razão pela qual o
     * tecto saiu.
     */
    expect(signal.scoreBreakdown.contextualAdjustment).toBeCloseTo(pointsFromVisibleBonuses, 6);
    expect(signal.scoreBreakdown.contextualAdjustment / signal.scoreBreakdown.hybridPoints).toBeGreaterThan(0.12);
    expect(signal.draftScore).toBeCloseTo(signal.scoreBreakdown.hybridPoints + signal.scoreBreakdown.contextualAdjustment, 6);
  });

  it("não corta os fatores contextuais em nenhum estado do draft", () => {
    const row = { brawler: "Brock", score: 80, tier: "S" as const, brawlPlanetWinRate: 58 };
    const directCounter = getCounterProfile(row.brawler).counteredBy[0]!;
    const opening = calculateDraftSignal(row, {
      bannedNames: new Set([directCounter, getCounterProfile(row.brawler).counteredBy[1]!]),
      baseHybridTop25Names: new Set([directCounter, getCounterProfile(row.brawler).counteredBy[1]!]),
      pickNumber: 1,
    });
    const late = calculateDraftSignal(row, {
      allyRows: [{ brawler: "Pearl", score: 75, tier: "S" as const, brawlPlanetWinRate: 53 }, { brawler: "Gene", score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }],
      enemyRows: [{ brawler: getCounterProfile(row.brawler).counters[0]!, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }, { brawler: getCounterProfile(row.brawler).counters[1]!, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }],
      pickNumber: 5,
    });

    /**
     * Antes, estes dois cenários levavam tectos diferentes: +8% na abertura e
     * +20% no fecho, sobre a Base híbrida. A ideia era o mapa mandar enquanto o
     * tabuleiro estivesse vazio; o efeito era as regras do painel do Draft não
     * valerem o que dizem, e dois candidatos com fatores muito diferentes
     * encostarem ao mesmo tecto.
     *
     * Em qualquer estado do draft, o ajuste é agora a diferença entre a soma dos
     * bónus e a soma dos desbónus. Nada é cortado.
     */
    for (const sinal of [opening, late]) {
      expect(sinal.scoreBreakdown.contextualAdjustment).toBeCloseTo(
        sinal.scoreBreakdown.rawContextualBonusPoints - sinal.scoreBreakdown.rawContextualPenaltyPoints,
        6,
      );
      expect(sinal.draftScore).toBeCloseTo(sinal.scoreBreakdown.hybridPoints + sinal.scoreBreakdown.contextualAdjustment, 6);
    }
    // Na abertura, o bónus de ban passava do tecto de +8% e era cortado.
    expect(opening.scoreBreakdown.rawContextualBonusPoints / opening.scoreBreakdown.hybridPoints).toBeGreaterThan(0.08);
  });

  it("calculates Draft Score signals with reasons, confidence and objective context", () => {
    const signal = calculateDraftSignal({ brawler: "Bibi", score: 78, tier: "S", brawlPlanetWinRate: 58, topBrawlUseRate: 20, topBrawlWinRate: 57, topBrawlScore: 11, brawlPlanetPickRate: 18, brawlPlanetStarPlayer: 12 }, { mapModeId: "brawl-ball", allyRows: [], enemyRows: [] });
    expect(signal.draftScore).toBeGreaterThan(0);
    expect(signal.coachScore).toBe(signal.draftScore);
    expect(signal.confidence).toBeGreaterThan(50);
    expect(signal.reasons.length).toBeGreaterThan(0);
    expect(signal.decisionType).toBe("Win Condition");
  });

  it("preserves the 0–100 Hybrid Score as a distinct individual base instead of treating it as a 0–13 TopBrawl score", () => {
    const lowerHybrid = calculateDraftSignal({ brawler: "Belle", score: 62, tier: "B" as const, brawlPlanetWinRate: 52 }, { allyRows: [], enemyRows: [] });
    const higherHybrid = calculateDraftSignal({ brawler: "Bibi", score: 82, tier: "S" as const, brawlPlanetWinRate: 52 }, { allyRows: [], enemyRows: [] });

    expect(lowerHybrid.metaSignal).toBe(62);
    expect(higherHybrid.metaSignal).toBe(82);
    expect(higherHybrid.scoreBreakdown.hybridPoints - lowerHybrid.scoreBreakdown.hybridPoints).toBeCloseTo(20, 6);
    expect(higherHybrid.draftScore).toBeGreaterThan(lowerHybrid.draftScore);
  });

  it("only raises the same brawler score when a verified bonus condition is active", () => {
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const counterTarget = getCounterProfile(row.brawler).counters[0]!;
    const threateningEnemy = getCounterProfile(row.brawler).counteredBy[0]!;
    const potentialRoles = [
      { brawler: "Gus", score: 70, tier: "A" as const, brawlPlanetWinRate: 53 },
      { brawler: "Bull", score: 70, tier: "A" as const, brawlPlanetWinRate: 53 },
      { brawler: "Bibi", score: 70, tier: "A" as const, brawlPlanetWinRate: 53 },
    ];
    // Mede uma resposta ainda não coberta: um aliado que countere o mesmo alvo
    // anula corretamente o novo bónus unitário.
    const filledRoles = potentialRoles.filter((ally) => !getCounterProfile(ally.brawler).counters.includes(counterTarget));
    const neutral = calculateDraftSignal(row, { allyRows: filledRoles, enemyRows: [] });
    const favorable = calculateDraftSignal(row, { allyRows: filledRoles, enemyRows: [{ brawler: counterTarget, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }] });
    const threatened = calculateDraftSignal(row, { allyRows: filledRoles, enemyRows: [{ brawler: threateningEnemy, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }] });

    expect(favorable.scoreBreakdown.hybridScore).toBe(neutral.scoreBreakdown.hybridScore);
    expect(neutral.scoreBreakdown.counterPoints).toBe(0);
    expect(favorable.scoreBreakdown.counterPoints).toBeGreaterThan(0);
    expect(favorable.draftScore).toBeCloseTo(
      neutral.draftScore + favorable.scoreBreakdown.contextualAdjustment - neutral.scoreBreakdown.contextualAdjustment,
      6,
    );
    // O desbónus separado de Enemy Counter foi desligado: quem faz o Score descer
    // num confronto desfavorável é o próprio delta de Counter, agora com sinal.
    expect(threatened.scoreBreakdown.enemyCounterPenaltyPoints).toBe(0);
    expect(threatened.scoreBreakdown.counterPoints).toBeLessThan(0);
    expect(threatened.draftScore).toBeLessThan(neutral.draftScore);
  });

  it("applies the configured penalty when an enemy pick is a literal counter to it", () => {
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const filledRoles = [
      { brawler: "Gus", score: 70, tier: "A" as const, brawlPlanetWinRate: 53 },
      { brawler: "Bull", score: 70, tier: "A" as const, brawlPlanetWinRate: 53 },
      { brawler: "Bibi", score: 70, tier: "A" as const, brawlPlanetWinRate: 53 },
    ];
    const pressureEnemy = getCounterProfile(row.brawler).counteredBy.find((enemy) =>
      getMatchupValue(row.brawler, enemy).total < 0
      && getCounterProfile(enemy).counters.some((target) => target !== row.brawler),
    )!;
    const counteredAlly = getCounterProfile(pressureEnemy).counters.find((target) => target !== row.brawler)!;
    // O mesmo inimigo countera Brock e o aliado literal: o candidato perde pontos
    // pelo delta negativo do confronto e ainda recebe a pressão por já existir um
    // aliado counterado.
    const allyRows = [{ brawler: counteredAlly, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }, ...filledRoles];
    const baseContext = { allyRows, isCandidateUnselected: true, topRecommendationNames: [row.brawler] };
    const safe = calculateDraftSignal(row, { ...baseContext, enemyRows: [] });
    const threatened = calculateDraftSignal(row, {
      ...baseContext,
      enemyRows: [{ brawler: pressureEnemy, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }],
    });
    // A pressão escala com o número de aliados já counterados pelo mesmo inimigo,
    // até ao limite de dois; o número sai da regra, não do resultado do motor.
    const pressureCount = Math.min(
      [counteredAlly, ...filledRoles.map((ally) => ally.brawler)]
        .filter((ally) => getMatchupValue(ally, pressureEnemy).total < 0).length,
      2,
    );

    // O desbónus configurável de Enemy Counter está desligado de propósito para
    // não contar o mesmo confronto duas vezes; a penalização vive agora no Counter.
    expect(threatened.scoreBreakdown.enemyCounterPenaltyPoints).toBe(0);
    expect(threatened.scoreBreakdown.counterPoints)
      .toBeCloseTo(expectedCounterPoints(threatened.scoreBreakdown.hybridPoints, row.brawler, [pressureEnemy]), 6);
    expect(threatened.scoreBreakdown.counterPoints).toBeLessThan(0);
    expect(pressureCount).toBeGreaterThan(0);
    expect(threatened.scoreBreakdown.repeatedEnemyCounterPressurePoints).toBeCloseTo(
      threatened.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.repeatedEnemyCounterPressure * pressureCount,
      6,
    );
    // A comparação é com a MESMA equipa aliada sem o inimigo ameaçador, para
    // isolar a penalização dos bónus que os aliados já traziam.
    expect(threatened.draftScore).toBeLessThan(safe.draftScore);
    expect(threatened.reasons.join(" ")).not.toContain("Desbônus Inimigo Counter");
  });

  // O par Glowy/Bolt mudou de sentido na reimportação do catálogo. O que continua
  // a valer é a regra: o perfil só apresenta um confronto no sentido que o delta
  // publicado para esse par confirma, nunca nos dois ao mesmo tempo.
  it("deixa Glowy/Bolt neutro nos dois sentidos, por ser uma direção rejeitada", () => {
    // A direção "Glowy countera Bolt" foi rejeitada manualmente após validação
    // competitiva. A rejeição tem de valer nos dois sentidos: se valesse só num,
    // Glowy não ganhava nada e Bolt continuava a perder pontos pelo mesmo
    // confronto — e o Score contradizia a auditoria.
    expect(getMatchupValue("Glowy", "Bolt").base).toBeNull();
    expect(getMatchupValue("Bolt", "Glowy").base).toBeNull();
    expect(getMatchupValue("Glowy", "Bolt").total).toBe(0);
    expect(getMatchupValue("Bolt", "Glowy").total).toBe(0);
    expect(getCounterProfile("Bolt").counters).not.toContain("Glowy");
    expect(getCounterProfile("Glowy").counters).not.toContain("Bolt");
    expect(getCounterProfile("Bolt").counteredBy).not.toContain("Glowy");
    expect(getCounterProfile("Glowy").counteredBy).not.toContain("Bolt");
  });

  it("lê cada lado do par pela ficha do próprio brawler, mesmo quando as duas se contradizem", () => {
    /**
     * A fonte mede cada confronto contra a média do ADVERSÁRIO, não contra uma
     * média comum. Por isso dois brawlers fortes aparecem, cada um na sua ficha,
     * a punir o outro — "Nori vs Bolt: +1,3 / +3,6" é uma leitura legítima da
     * fonte, não um erro de sinal. A decisão do projeto é que vale sempre a
     * ficha de quem está a ser avaliado: escolher a Wendy não pode perder pontos
     * só porque a ficha do adversário afirma o contrário.
     *
     * Este teste fixa essa decisão. O que não pode acontecer é o valor de um
     * lado ser deduzido do outro por inversão de sinal.
     */
    const nomes = rankedBrawlerNames.slice(0, 40);
    const reciprocos = nomes
      .flatMap((esquerda) => nomes.map((direita) => [esquerda, direita] as const))
      .filter(([esquerda, direita]) => esquerda !== direita)
      .map(([esquerda, direita]) => ({
        esquerda,
        direita,
        ida: getMatchupValue(esquerda, direita).total,
        volta: getMatchupValue(direita, esquerda).total,
      }))
      .filter((par) => par.ida !== 0 && par.volta !== 0);

    expect(reciprocos.length).toBeGreaterThan(0);
    // Se um lado fosse o simétrico do outro, a leitura por ficha era ilusória.
    expect(reciprocos.some((par) => par.ida !== -par.volta)).toBe(true);
    // E cada valor tem de ser exatamente o que a ficha desse brawler publica.
    for (const par of reciprocos.slice(0, 25)) {
      expect(getMatchupValue(par.esquerda, par.direita).total).toBe(par.ida);
      expect(getMatchupValue(par.direita, par.esquerda).total).toBe(par.volta);
    }
  });

  it("stacks the configured penalty per allied Worst Teammate published by Brawl Planet", () => {
    const row = { brawler: "8-Bit", score: 80, tier: "S" as const, brawlPlanetWinRate: 55 };
    const withOneWorstTeammate = calculateDraftSignal(row, {
      allyRows: [{ brawler: "Charlie", score: 70, tier: "A" as const }],
      enemyRows: [],
    });
    const withTwoWorstTeammates = calculateDraftSignal(row, {
      allyRows: [
        { brawler: "Charlie", score: 70, tier: "A" as const },
        { brawler: "Hank", score: 70, tier: "A" as const },
      ],
      enemyRows: [],
    });

    expect(draftSignalBonuses.worstTeammatePenalty).toBe(defaultDraftRuleSettings.worstTeammatePenalty);
    expect(withOneWorstTeammate.scoreBreakdown.worstTeammatePenaltyPoints).toBeCloseTo(
      withOneWorstTeammate.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.worstTeammatePenalty,
      6,
    );
    expect(withTwoWorstTeammates.scoreBreakdown.worstTeammatePenaltyPoints).toBeCloseTo(
      withTwoWorstTeammates.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.worstTeammatePenalty * 2,
      6,
    );
    expect(withTwoWorstTeammates.bonusSources.worstTeammatePenalties).toEqual(["Charlie", "Hank"]);
    expect(withTwoWorstTeammates.scoreBreakdown.activeBonuses).toContain(`Worst Teammate -${defaultDraftRuleSettings.worstTeammatePenalty * 100 * 2}% (Charlie, Hank)`);
    expect(withTwoWorstTeammates.reasons.join(" ")).toContain(`Desbônus Worst Teammate -${defaultDraftRuleSettings.worstTeammatePenalty * 100 * 2}%`);
    expect(withTwoWorstTeammates.draftScore).toBeCloseTo(
      withTwoWorstTeammates.scoreBreakdown.hybridPoints + withTwoWorstTeammates.scoreBreakdown.contextualAdjustment,
      6,
    );
  });

  it("increases the score by the configured rate for each direct counter banned no Top 25 por Score Híbrido base at the first pick", () => {
    const profile = getCounterProfile("Brock");
    const directCounter = profile.counteredBy[0];
    expect(directCounter).toBeTruthy();
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 55 };
    const allyMid = [
      { brawler: "Gus", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 },
      { brawler: "Bull", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 },
      { brawler: "Bibi", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 },
    ];
    const base = calculateDraftSignal(row, { allyRows: allyMid, enemyRows: [] });
    const withCounterBanned = calculateDraftSignal(row, {
      allyRows: allyMid,
      enemyRows: [],
      bannedNames: new Set([directCounter]),
      baseHybridTop25Names: new Set([directCounter]),
    });
    expect(withCounterBanned.draftScore).toBeCloseTo(base.draftScore + withCounterBanned.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.banPick1, 6);
    expect(withCounterBanned.reasons.join(" ")).toContain(`Bónus Counter banido +${defaultDraftRuleSettings.banPick1 * 100}%`);
    // A frase do bónus passou a nomear as duas condições do ban explicitamente.
    expect(withCounterBanned.reasons.join(" ")).toContain("Top 10 de counters (BrawlScope / PL Prodigy) + Top 25 do mapa");
    expect(withCounterBanned.reasons.join(" ")).toContain(`pick 1: +${defaultDraftRuleSettings.banPick1 * 100}% por counter`);
  });

  it("stacks the pick-two Ban rate for every direct counter banned", () => {
    const profile = getCounterProfile("Brock");
    const bannedCounters = profile.counteredBy.slice(0, 2);
    expect(bannedCounters).toHaveLength(2);
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 55 };
    const allyMid = [
      { brawler: "Gus", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 },
      { brawler: "Bull", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 },
      { brawler: "Bibi", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 },
    ];
    const withTwoCountersBanned = calculateDraftSignal(row, {
      allyRows: allyMid,
      enemyRows: [],
      bannedNames: new Set(bannedCounters),
      baseHybridTop25Names: new Set(bannedCounters),
      pickNumber: 2,
    });

    expect(withTwoCountersBanned.bannedCounterCount).toBe(2);
    expect(withTwoCountersBanned.scoreBreakdown.banPoints).toBeCloseTo(
      withTwoCountersBanned.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.banPick2 * 2,
      6,
    );
    expect(withTwoCountersBanned.draftScore).toBeCloseTo(
      withTwoCountersBanned.scoreBreakdown.hybridPoints + withTwoCountersBanned.scoreBreakdown.contextualAdjustment,
      6,
    );
    expect(withTwoCountersBanned.scoreBreakdown.activeBonuses).toContain(
      `Counter banido +${defaultDraftRuleSettings.banPick2 * 100 * 2}% (2 counters · Top 10 de counters (BrawlScope / PL Prodigy) + Top 25 do mapa · pick 2: +${defaultDraftRuleSettings.banPick2 * 100}% por counter)`,
    );
  });

  it("does not reward Counter de Ban when the banned direct counter is outside the base Hybrid Score Top 25", () => {
    const profile = getCounterProfile("Brock");
    const directCounter = profile.counteredBy[0];
    expect(directCounter).toBeTruthy();
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 55 };
    const signal = calculateDraftSignal(row, {
      allyRows: [],
      enemyRows: [],
      bannedNames: new Set([directCounter]),
      baseHybridTop25Names: new Set(["Wendy"]),
    });

    expect(signal.bannedCounterCount).toBe(0);
    expect(signal.scoreBreakdown.banPoints).toBe(0);
    expect(signal.bonusSources.nonTop25BannedCounters).toEqual([directCounter]);
    expect(signal.reasons.join(" ")).toContain("fora do Top 25 de Score Híbrido base do mapa");
  });

  // A janela Top 30 deixou de filtrar os bónus: o delta BrawlScope é específico do
  // par e vale para qualquer brawler do catálogo, por isso limitar o bónus à
  // posição do candidato no Top 30 do mapa descartava confrontos legítimos.
  it("no longer limits Counter de Pick and Counter de Ban bonuses to the base Hybrid Score Top 30", () => {
    const profile = getCounterProfile("Brock");
    const directCounter = profile.counteredBy[0];
    const counterTarget = profile.counters[0];
    expect(directCounter).toBeTruthy();
    expect(counterTarget).toBeTruthy();
    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 55 };
    const outsideTop30 = calculateDraftSignal(row, {
      enemyRows: [{ brawler: counterTarget, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }],
      bannedNames: new Set([directCounter]),
      baseHybridTop25Names: new Set([directCounter]),
      baseHybridTop30Names: new Set(["Wendy"]),
      pickNumber: 1,
    });
    const insideTop30 = calculateDraftSignal(row, {
      enemyRows: [{ brawler: counterTarget, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 }],
      bannedNames: new Set([directCounter]),
      baseHybridTop25Names: new Set([directCounter]),
      baseHybridTop30Names: new Set(["Brock"]),
      pickNumber: 1,
    });

    // Estar fora do Top 30 do mapa já não retira nada: o candidato continua
    // elegível e nenhuma lista de exclusão é preenchida.
    expect(outsideTop30.scoreBreakdown.isTop30CounterBonusEligible).toBe(true);
    expect(outsideTop30.bonusSources.counterTargets).toEqual([counterTarget]);
    expect(outsideTop30.bonusSources.counterBonusTargets).toEqual([counterTarget]);
    expect(outsideTop30.bonusSources.nonTop30CounterBonusTargets).toEqual([]);
    expect(outsideTop30.bonusSources.nonTop30BannedCounters).toEqual([]);
    expect(outsideTop30.reasons.join(" ")).not.toContain("fora do Top 30 por Score Híbrido base");

    // E o resultado é exatamente o mesmo dentro e fora da janela.
    expect(outsideTop30.scoreBreakdown.counterPoints)
      .toBeCloseTo(expectedCounterPoints(outsideTop30.scoreBreakdown.hybridPoints, row.brawler, [counterTarget]), 6);
    expect(outsideTop30.scoreBreakdown.counterPoints).toBeCloseTo(insideTop30.scoreBreakdown.counterPoints, 6);
    expect(outsideTop30.scoreBreakdown.banPoints).toBeCloseTo(insideTop30.scoreBreakdown.banPoints, 6);
    expect(insideTop30.scoreBreakdown.counterPoints).toBeGreaterThan(0);
    expect(insideTop30.scoreBreakdown.banPoints).toBeGreaterThan(0);
  });

  it("uses the official Ban rate matrix and keeps the fifth rate after the fifth pick", () => {
    const expectedRates = [
      defaultDraftRuleSettings.banPick1,
      defaultDraftRuleSettings.banPick2,
      defaultDraftRuleSettings.banPick3,
      defaultDraftRuleSettings.banPick4,
      defaultDraftRuleSettings.banPick5Plus,
      defaultDraftRuleSettings.banPick5Plus,
      defaultDraftRuleSettings.banPick1,
      defaultDraftRuleSettings.banPick1,
    ];
    expect([1, 2, 3, 4, 5, 6, 0, undefined].map(getBannedCounterBonusRate)).toEqual(expectedRates);
    expect([1, 2, 3, 4, 5, 6, 0, undefined].map(getBannedCounterBonusPick)).toEqual([1, 2, 3, 4, 5, 5, 1, 1]);

    const row = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 55 };
    const directCounter = getCounterProfile("Brock").counteredBy[0];
    const signals = [1, 2, 3, 4, 5].map((pickNumber) => calculateDraftSignal(row, {
      allyRows: [{ brawler: "Gus", score: 70, tier: "A" as const, brawlPlanetWinRate: 55 }],
      enemyRows: [],
      bannedNames: new Set([directCounter]),
      baseHybridTop25Names: new Set([directCounter]),
      pickNumber,
    }));

    expectedRates.slice(0, 5).forEach((rate, index) => {
      expect(signals[index].scoreBreakdown.banPoints).toBeCloseTo(signals[index].scoreBreakdown.hybridPoints * rate, 6);
    });
    expect(signals.map((signal) => signal.scoreBreakdown.banBonusRate)).toEqual(expectedRates.slice(0, 5));
    expect(signals.map((signal) => signal.scoreBreakdown.banBonusPick)).toEqual([1, 2, 3, 4, 5]);
  });

  it("adds the configured opening rate only to non-Artillery brawlers with at least 6 blocks, including Eugenio, in picks 1 through 3", () => {
    const brock = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const barley = { brawler: "Barley", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const clancy = { brawler: "Clancy", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const gene = { brawler: "Gene", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const bibi = { brawler: "Bibi", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const filledRoles = [
      { brawler: "Gus", score: 70, tier: "A" as const },
      { brawler: "Bull", score: 70, tier: "A" as const },
      { brawler: "Bibi", score: 70, tier: "A" as const },
    ];
    const brockOpening = calculateDraftSignal(brock, { allyRows: filledRoles, pickNumber: 1 });
    const brockSecondPick = calculateDraftSignal(brock, { allyRows: filledRoles, pickNumber: 2 });
    const brockFourthPick = calculateDraftSignal(brock, { allyRows: filledRoles, pickNumber: 4 });
    const barleyOpening = calculateDraftSignal(barley, { allyRows: filledRoles, pickNumber: 1 });
    const clancyOpening = calculateDraftSignal(clancy, { allyRows: filledRoles, pickNumber: 1 });
    const geneOpening = calculateDraftSignal(gene, { allyRows: filledRoles, pickNumber: 1 });
    const bibiOpening = calculateDraftSignal(bibi, { allyRows: filledRoles, pickNumber: 1 });

    expect(openingRangeThreshold).toBe(6);
    expect(isOpeningLongRangeEligible("Brock")).toBe(true);
    expect(isOpeningLongRangeEligible("Clancy")).toBe(true);
    expect(isOpeningLongRangeEligible("Gene")).toBe(true);
    expect(isOpeningLongRangeEligible("Angelo")).toBe(true);
    expect(isOpeningLongRangeEligible("Charlie")).toBe(true);
    expect(isOpeningLongRangeEligible("Najia")).toBe(true);
    expect(isOpeningLongRangeEligible("Janet")).toBe(true);
    expect(isOpeningLongRangeEligible("Ziggy")).toBe(false);
    expect(isOpeningLongRangeEligible("Berry")).toBe(false);
    expect(isOpeningLongRangeEligible("Darryl")).toBe(false);
    expect(isOpeningLongRangeEligible("Frank")).toBe(false);
    expect(isOpeningLongRangeEligible("Ollie")).toBe(false);
    expect(isOpeningLongRangeEligible("Kit")).toBe(false);
    expect(isOpeningLongRangeEligible("Buster")).toBe(false);
    expect(isOpeningLongRangeEligible("Nori")).toBe(false);
    expect(isArtilleryBrawler("Barley")).toBe(true);
    expect(isOpeningLongRangeEligible("Barley")).toBe(false);
    expect(isOpeningLongRangeEligible("Bibi")).toBe(false);
    expect(brockOpening.scoreBreakdown.openingLongRangePoints).toBeCloseTo(brockOpening.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.openingLongRange, 6);
    expect(brockOpening.draftScore).toBeCloseTo(brockOpening.scoreBreakdown.hybridPoints + brockOpening.scoreBreakdown.contextualAdjustment, 6);
    expect(brockSecondPick.scoreBreakdown.openingLongRangePoints).toBeCloseTo(brockSecondPick.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.openingLongRange, 6);
    expect(brockSecondPick.draftScore).toBeCloseTo(brockSecondPick.scoreBreakdown.hybridPoints + brockSecondPick.scoreBreakdown.contextualAdjustment, 6);
    expect(brockFourthPick.scoreBreakdown.openingLongRangePoints).toBe(0);
    expect(barleyOpening.scoreBreakdown.openingLongRangePoints).toBe(0);
    expect(clancyOpening.scoreBreakdown.openingLongRangePoints).toBeCloseTo(clancyOpening.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.openingLongRange, 6);
    expect(geneOpening.scoreBreakdown.openingLongRangePoints).toBeCloseTo(geneOpening.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.openingLongRange, 6);
    expect(bibiOpening.scoreBreakdown.openingLongRangePoints).toBe(0);
  });

  it("adds the configured Mid Fit and literal Best Teammate rates", () => {
    const positionalFit = calculateDraftSignal(
      { brawler: "Brock", score: 69, tier: "A", brawlPlanetWinRate: 50 },
      { allyRows: [{ brawler: "Bibi", score: 75, tier: "S", brawlPlanetWinRate: 50 }] },
    );
    const literalSynergy = calculateDraftSignal(
      { brawler: "Brock", score: 69, tier: "A", brawlPlanetWinRate: 50 },
      { allyRows: [{ brawler: "Gene", score: 75, tier: "S", brawlPlanetWinRate: 50 }] },
    );

    expect(positionalFit.scoreBreakdown.missingMidPoints).toBeCloseTo(positionalFit.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.missingMid, 6);
    expect(positionalFit.scoreBreakdown.synergyPoints).toBe(0);
    expect(positionalFit.draftScore).toBeCloseTo(positionalFit.scoreBreakdown.hybridPoints + positionalFit.scoreBreakdown.contextualAdjustment, 6);
    expect(literalSynergy.scoreBreakdown.missingMidPoints).toBe(0);
    // A percentagem publicada para o par substitui a taxa por pick quando existe.
    expect(literalSynergy.scoreBreakdown.synergyPoints).toBeCloseTo(
      literalSynergy.scoreBreakdown.hybridPoints * expectedSynergyRate("Brock", ["Gene"], defaultDraftRuleSettings.synergyPick1),
      6,
    );
    expect(literalSynergy.bonusSources.synergyAllies).toEqual(["Gene"]);
    expect(literalSynergy.scoreBreakdown.missingSidePoints).toBe(0);
    expect(literalSynergy.draftScore).toBeCloseTo(literalSynergy.scoreBreakdown.hybridPoints + literalSynergy.scoreBreakdown.contextualAdjustment, 6);
  });

  it("does not treat a Mid ally as Flex and removes Mid Fit from the next Mid candidate", () => {
    const brock = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 50 };
    const withMissingMid = calculateDraftSignal(brock, { allyRows: [{ brawler: "Bibi", score: 75, tier: "S" as const, brawlPlanetWinRate: 50 }] });
    // Gus é Mid, não partilha a classe de Brock e não ativa Best/Worst Teammate.
    const withMidAlreadyChosen = calculateDraftSignal(brock, { allyRows: [{ brawler: "Gus", score: 75, tier: "S" as const, brawlPlanetWinRate: 50 }] });

    expect(withMissingMid.scoreBreakdown.missingMidPoints).toBeCloseTo(withMissingMid.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.missingMid, 6);
    expect(withMidAlreadyChosen.scoreBreakdown.missingMidPoints).toBe(0);
    expect(withMidAlreadyChosen.scoreBreakdown.missingSidePoints).toBe(0);
    expect(withMidAlreadyChosen.draftScore).toBeCloseTo(69, 6);
  });

  it("adds the configured Side Fit until both Side lanes are filled, then removes it for all remaining Side picks", () => {
    const ash = { brawler: "Ash", score: 69, tier: "A" as const, brawlPlanetWinRate: 50 };
    const withOneSide = calculateDraftSignal(ash, { allyRows: [{ brawler: "Gene", score: 75, tier: "S" as const, brawlPlanetWinRate: 50 }] });
    // Bull, Bibi e Ash são Tanks. Cada Tank aliado aplica a penalidade de classe configurada.
    const withBothSides = calculateDraftSignal(ash, { allyRows: [
      { brawler: "Bull", score: 75, tier: "S" as const, brawlPlanetWinRate: 50 },
      { brawler: "Bibi", score: 75, tier: "S" as const, brawlPlanetWinRate: 50 },
    ] });

    expect(withOneSide.scoreBreakdown.missingSidePoints).toBeCloseTo(withOneSide.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.missingSide, 6);
    expect(withBothSides.scoreBreakdown.missingSidePoints).toBe(0);
    expect(withBothSides.scoreBreakdown.sameClassPenaltyPoints).toBeCloseTo(withBothSides.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.sameClassPenalty * 3.5, 6);
    /**
     * Dois Tanks aliados são −3% cada: −6% no total, que cabia no antigo tecto de
     * desbónus deste estado (−8%) e não era cortado. O que este teste guarda,
     * agora, é que o ajuste é a soma — não que o tecto fazia falta aqui.
     */
    expect(withBothSides.scoreBreakdown.contextualAdjustment).toBeCloseTo(-withBothSides.scoreBreakdown.sameClassPenaltyPoints, 6);
    expect(withBothSides.draftScore).toBeCloseTo(withBothSides.scoreBreakdown.hybridPoints + withBothSides.scoreBreakdown.contextualAdjustment, 6);
  });

  it("mantém o catálogo neutro antes do primeiro aliado e aplica Fit apenas após composição real", () => {
    const catalogRows = Array.from(new Map(allRankedRows.map((row) => [row.brawler, row])).values());
    expect(catalogRows).toHaveLength(106);

    for (const row of catalogRows) {
      const signal = calculateDraftSignal(row, { allyRows: [], enemyRows: [] });
      const withMidAlreadyChosen = calculateDraftSignal(row, { allyRows: [{ brawler: "Belle", score: 70, tier: "A" as const }], enemyRows: [] });
      const withBothSidesChosen = calculateDraftSignal(row, { allyRows: [
        { brawler: "Bibi", score: 70, tier: "A" as const },
        { brawler: "Bull", score: 70, tier: "A" as const },
      ], enemyRows: [] });
      /**
       * Antes exigia-se Fit zero com a equipa vazia. Isso significava que nos
       * dois primeiros picks do draft o bónus nunca existia — e era a queixa
       * certa: "o Fit tem de funcionar desde o primeiro pick".
       *
       * O que continua a ter de ser verdade é a regra de um só Fit: nenhuma
       * recomendação pode receber Mid e Lane ao mesmo tempo, e o Fit de
       * abertura nunca pode passar a taxa configurada.
       */
      const fits = [signal.scoreBreakdown.missingMidPoints, signal.scoreBreakdown.missingSidePoints];
      expect(fits.filter((points) => points > 0)).toHaveLength(1);
      expect(fits.reduce((sum, points) => sum + points, 0))
        .toBeLessThanOrEqual(signal.metaSignal * Math.max(defaultDraftRuleSettings.missingMid, defaultDraftRuleSettings.missingSide) + 1e-9);
      expect(signal.draftScore).toBeGreaterThan(signal.metaSignal);
      expect(withMidAlreadyChosen.scoreBreakdown.missingMidPoints).toBe(0);
      expect(withBothSidesChosen.scoreBreakdown.missingSidePoints).toBe(0);
    }
  });

  it("keeps Flex distinct while allowing it to fill one missing role without duplicating Fit", () => {
    const flexRow = Array.from(new Map(allRankedRows.map((row) => [row.brawler, row])).values()).find((row) => inferDraftRole(row.brawler) === "flex");
    expect(flexRow).toBeTruthy();
    const start = calculateDraftSignal(flexRow!, { allyRows: [], enemyRows: [] });
    const midCovered = calculateDraftSignal(flexRow!, { allyRows: [{ brawler: "Belle", score: 70, tier: "A" as const }], enemyRows: [] });
    const fullRoles = calculateDraftSignal(flexRow!, { allyRows: [
      { brawler: "Belle", score: 70, tier: "A" as const },
      { brawler: "Bibi", score: 70, tier: "A" as const },
      { brawler: "Bull", score: 70, tier: "A" as const },
    ], enemyRows: [] });

    // Equipa vazia: o Flex recebe o Fit de abertura, mas só um — a prioridade
    // continua a ser o Mid, e a Lane não pode somar por cima.
    expect(start.scoreBreakdown.missingMidPoints).toBeGreaterThan(0);
    expect(start.scoreBreakdown.missingSidePoints).toBe(0);
    expect(midCovered.scoreBreakdown.missingMidPoints).toBe(0);
    expect(midCovered.scoreBreakdown.missingSidePoints).toBeCloseTo(midCovered.metaSignal * defaultDraftRuleSettings.missingSide, 6);
    expect(fullRoles.scoreBreakdown.missingMidPoints + fullRoles.scoreBreakdown.missingSidePoints).toBe(0);
  });

  it("reads composition coverage and produces actionable risks and win conditions", () => {
    const ally = [
      { brawler: "Bibi", score: 78, tier: "S" as const, brawlPlanetWinRate: 58 },
      { brawler: "Belle", score: 74, tier: "A" as const, brawlPlanetWinRate: 56 },
    ];
    const enemy = [{ brawler: "Mortis", score: 76, tier: "S" as const, brawlPlanetWinRate: 62 }];
    const analysis = analyzeDraftComposition(ally, enemy, "brawl-ball");
    expect(analysis.roleCounts.side).toBe(1);
    expect(analysis.roleCounts.mid).toBe(1);
    expect(analysis.roleCounts.flex).toBe(0);
    expect(analysis.roleCoverage).toBe(67);
    expect(analysis.winCondition).toContain("espaço");
    expect(analysis.risks.length).toBeGreaterThan(0);
    expect(analysis.confidence).toBeGreaterThan(0);
  });

  it("returns a no-pick warning while preserving a mode-specific plan", () => {
    const analysis = analyzeDraftComposition([], [], "heist");
    expect(analysis.risks[0]).toContain("Ainda não há picks aliados");
    expect(analysis.winCondition).toContain("cofre");
    expect(analysis.openingPlan).toContain("defensor");
  });

  it("handles live counter suggestions gracefully when no explicit counter database is loaded", () => {
    const suggestions = getLiveCounterSuggestions(["Spike"], [
      { brawler: "Willow", score: 82, tier: "S" as const, brawlPlanetWinRate: 60 },
      { brawler: "Belle", score: 78, tier: "S" as const, brawlPlanetWinRate: 58 },
    ]);
    expect(suggestions).toBeDefined();
  });

  it("normalizes Hybrid Score and combines strength, role coverage and direct counter pressure", () => {
    const blue = [
      { brawler: "Griff", score: 82, tier: "S" as const, brawlPlanetWinRate: 60 },
      { brawler: "Belle", score: 78, tier: "S" as const, brawlPlanetWinRate: 58 },
      { brawler: "Stu", score: 75, tier: "A" as const, brawlPlanetWinRate: 56 },
    ];
    const red = [
      { brawler: "Frank", score: 62, tier: "B" as const, brawlPlanetWinRate: 45 },
      { brawler: "Bull", score: 58, tier: "B" as const, brawlPlanetWinRate: 43 },
      { brawler: "Ash", score: 60, tier: "B" as const, brawlPlanetWinRate: 44 },
    ];
    const estimate = estimateDraftWinProbability(blue, red);
    expect(estimate.blueWinProbability + estimate.redWinProbability).toBe(100);
    expect(estimate.blueWinProbability).toBeGreaterThan(estimate.redWinProbability);
    expect(estimate.blueWinProbability).toBeLessThanOrEqual(100);
    expect(estimate.redWinProbability).toBeGreaterThanOrEqual(0);
    expect(estimate.advantageLabel).toContain("Azul");
  });

  it("supports consecutive quick name searches while excluding brawlers already locked in the Draft", () => {
    const rows = [
      { brawler: "Amber", score: 72, tier: "A" as const },
      { brawler: "Bo", score: 82, tier: "S" as const },
      { brawler: "Carl", score: 65, tier: "A" as const },
      { brawler: "Darryl", score: null, tier: null },
    ];

    expect(rankDraftRows(rows, new Set(["Bo"]))).toEqual([
      { brawler: "Amber", score: 72, tier: "A" },
      { brawler: "Carl", score: 65, tier: "A" },
      { brawler: "Darryl", score: null, tier: null },
    ]);
    expect(rankDraftRows(rows, new Set(), "a").map((row) => row.brawler)).toEqual(["Amber", "Carl", "Darryl"]);
    expect(rankDraftRows(rows, new Set(), "  amber ").map((row) => row.brawler)).toEqual(["Amber"]);
    expect(rankDraftRows(rows, new Set(["Bo"]), "bo")).toEqual([]);
    expect(rankDraftRows(rows, new Set(["Amber"]), "  bo ").map((row) => row.brawler)).toEqual(["Bo"]);
  });

  it("ordena o rank por pontos do maior Score para o menor", () => {
    const rows = [
      { brawler: "El Primo", score: 54, tier: "B" as const },
      { brawler: "Bull", score: 82, tier: "S" as const },
      { brawler: "Frank", score: 68, tier: "A" as const },
    ];

    expect(rankDraftRows(rows, new Set()).map((row) => row.brawler)).toEqual(["Bull", "Frank", "El Primo"]);
  });
});


describe("same-class penalty explanations", () => {
  it("exposes the exact allied pick that activates the class penalty", () => {
    const signal = calculateDraftSignal(
      { brawler: "Pearl", score: 80, tier: "S" as const, brawlPlanetWinRate: 55 },
      {
        allyRows: [{ brawler: "Shelly", score: 75, tier: "S" as const, brawlPlanetWinRate: 54 }],
        enemyRows: [],
      },
    );

    expect(signal.scoreBreakdown.sameClassPenaltyPoints).toBeCloseTo(
      signal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.sameClassPenalty,
      6,
    );
    expect(signal.bonusSources.sameClassPenalties).toEqual(["Shelly"]);
    expect(signal.bonusSources.sameClassClass).toBe("Destruidor");
    expect(signal.scoreBreakdown.activeBonuses).toEqual(expect.arrayContaining([expect.stringContaining("ativado por Shelly")]));
    expect(signal.reasons.join(" ")).toContain("ativado por Shelly");
  });

  it("does not create a class trigger from a ban without an allied pick", () => {
    const signal = calculateDraftSignal(
      { brawler: "Pearl", score: 80, tier: "S" as const, brawlPlanetWinRate: 55 },
      {
        allyRows: [],
        enemyRows: [],
        bannedNames: new Set(["Pearl"]),
      },
    );

    expect(signal.scoreBreakdown.sameClassPenaltyPoints).toBe(0);
    expect(signal.bonusSources.sameClassPenalties).toEqual([]);
  });

  it("applies each perspective's class penalty only from that team's picks", () => {
    const blueActivator = allRankedRows.find((row) => row.brawler !== "Pearl" && row.brawler !== "Shelly" && getBrawlerClass(row.brawler) === getBrawlerClass("Pearl"));
    expect(blueActivator).toBeDefined();
    const redPerspective = calculateDraftSignal(
      { brawler: "Pearl", score: 80, tier: "S" as const, brawlPlanetWinRate: 55 },
      {
        allyRows: [{ brawler: "Shelly", score: 75, tier: "S" as const }],
        enemyRows: [blueActivator!],
      },
    );
    const bluePerspective = calculateDraftSignal(
      { brawler: "Pearl", score: 80, tier: "S" as const, brawlPlanetWinRate: 55 },
      {
        allyRows: [blueActivator!],
        enemyRows: [{ brawler: "Shelly", score: 75, tier: "S" as const }],
      },
    );

    expect(redPerspective.bonusSources.sameClassPenalties).toEqual(["Shelly"]);
    expect(bluePerspective.bonusSources.sameClassPenalties).toEqual([blueActivator!.brawler]);
    expect(redPerspective.bonusSources.sameClassPenalties).not.toContain(blueActivator!.brawler);
    expect(bluePerspective.bonusSources.sameClassPenalties).not.toContain("Shelly");
  });
});


describe("official class catalog regressions", () => {
  it("does not penalize Bonnie for Jae-yong or Mr. P on New Horizons", () => {
    const bonnie = { brawler: "Bonnie", score: 75, tier: "S" as const, brawlPlanetWinRate: 55 };
    const signal = calculateDraftSignal(bonnie, {
      allyRows: [
        { brawler: "Jae-yong", score: 70, tier: "A" as const },
        { brawler: "Mr. P", score: 70, tier: "A" as const },
      ],
      enemyRows: [],
    });

    expect(signal.scoreBreakdown.sameClassPenaltyPoints).toBe(0);
    expect(signal.bonusSources.sameClassPenalties).toEqual([]);
  });

  it("penalizes Bonnie only when an allied pick shares the official Marksman class", () => {
    const signal = calculateDraftSignal(
      { brawler: "Bonnie", score: 75, tier: "S" as const, brawlPlanetWinRate: 55 },
      { allyRows: [{ brawler: "Brock", score: 70, tier: "A" as const }], enemyRows: [] },
    );

    expect(signal.scoreBreakdown.sameClassPenaltyPoints).toBeCloseTo(
      signal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.sameClassPenalty,
      6,
    );
    expect(signal.bonusSources.sameClassPenalties).toEqual(["Brock"]);
  });

  it("classifies Bolt as Tank and never lets Bolt penalize an allied Marksman", () => {
    expect(getBrawlerClass("Bolt")).toBe("Tank");

    const signal = calculateDraftSignal(
      { brawler: "Bea", score: 75, tier: "S" as const, brawlPlanetWinRate: 55 },
      { allyRows: [{ brawler: "Bolt", score: 70, tier: "A" as const }], enemyRows: [] },
    );

    expect(signal.scoreBreakdown.sameClassPenaltyPoints).toBe(0);
    expect(signal.bonusSources.sameClassPenalties).toEqual([]);
  });

  it("maps Rico, Gene, Chuck, Darryl and Eve to their verified classes without false allied penalties", () => {
    const cases = [
      { candidate: "Rico", expectedClass: "Destruidor", differentClassAlly: "Amber" },
      { candidate: "Gene", expectedClass: "Controlador", differentClassAlly: "Poco" },
      { candidate: "Chuck", expectedClass: "Controlador", differentClassAlly: "Buzz" },
      { candidate: "Darryl", expectedClass: "Tank", differentClassAlly: "Colt" },
      { candidate: "Eve", expectedClass: "Destruidor", differentClassAlly: "Amber" },
    ] as const;

    for (const { candidate, expectedClass, differentClassAlly } of cases) {
      expect(getBrawlerClass(candidate)).toBe(expectedClass);
      const signal = calculateDraftSignal(
        { brawler: candidate, score: 75, tier: "S" as const, brawlPlanetWinRate: 55 },
        { allyRows: [{ brawler: differentClassAlly, score: 70, tier: "A" as const }], enemyRows: [] },
      );
      expect(signal.scoreBreakdown.sameClassPenaltyPoints, candidate).toBe(0);
      expect(signal.bonusSources.sameClassPenalties, candidate).toEqual([]);
    }
  });

  it("keeps every ranked brawler mapped to an explicit official class", () => {
    const catalogRows = Array.from(new Map(allRankedRows.map((row) => [row.brawler, row])).values());
    expect(catalogRows).toHaveLength(106);
    for (const row of catalogRows) {
      const signal = calculateDraftSignal(row, { allyRows: [], enemyRows: [] });
      expect(signal.bonusSources.sameClassClass).not.toBe("Flex");
    }
  });

  it("includes every eligible brawler, including Ash, in the complete final Draft ranking", () => {
    const rows = allRankedRows.filter((row) => row.brawler !== "Wendy");
    const ranked = rankDraftEntries(rows, new Set(), "", "Todos", { allyRows: [], enemyRows: [] });

    expect(ranked).toHaveLength(rows.length);
    expect(new Set(ranked.map((entry) => entry.row.brawler))).toEqual(new Set(rows.map((row) => row.brawler)));
    ranked.forEach((entry, index) => {
      expect(entry.rank).toBe(index + 1);
      if (index > 0) expect(ranked[index - 1].draftScore).toBeGreaterThanOrEqual(entry.draftScore);
    });

    const ash = ranked.find((entry) => entry.row.brawler === "Ash");
    expect(ash).toBeDefined();
    expect(ranked[ash!.rank - 1].row.brawler).toBe("Ash");
  });

  it("applies the same-class penalty and exposes its activator for every official class with multiple brawlers", () => {
    const catalogRows = Array.from(new Map(allRankedRows.map((row) => [row.brawler, row])).values());
    const rowsByClass = new Map<string, typeof catalogRows>();
    for (const row of catalogRows) {
      const className = getBrawlerClass(row.brawler);
      rowsByClass.set(className, [...(rowsByClass.get(className) ?? []), row]);
    }

    for (const [className, rows] of rowsByClass) {
      if (rows.length < 2) continue;
      const [candidate, activator] = rows;
      const signal = calculateDraftSignal(candidate, { allyRows: [activator], enemyRows: [] });
      expect(signal.scoreBreakdown.sameClassPenaltyPoints, className).toBeGreaterThan(0);
      expect(signal.bonusSources.sameClassClass, className).toBe(className);
      expect(signal.bonusSources.sameClassPenalties, className).toEqual([activator.brawler]);
    }
  });
});

describe("penalty totals for Draft cards", () => {
  it("keeps the visible penalty total derivable from the three structured penalty categories", () => {
    const signal = calculateDraftSignal(
      { brawler: "8-Bit", score: 80, tier: "S" as const, brawlPlanetWinRate: 55 },
      {
        allyRows: [
          { brawler: "Charlie", score: 70, tier: "A" as const },
          { brawler: "Hank", score: 70, tier: "A" as const },
        ],
        enemyRows: [],
      },
    );

    const visiblePenaltyTotal = signal.scoreBreakdown.enemyCounterPenaltyPoints
      + signal.scoreBreakdown.sameClassPenaltyPoints
      + signal.scoreBreakdown.worstTeammatePenaltyPoints;

    expect(visiblePenaltyTotal).toBeCloseTo(
      signal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.worstTeammatePenalty * 2,
      6,
    );
    expect(signal.bonusSources.worstTeammatePenalties).toEqual(["Charlie", "Hank"]);
  });
});

describe("v178: integração da força original do mapa na API", () => {
  it.each(["Bridge Too Far", "Shooting Star", "Out in the Open"])("%s preserva o terreno mesmo com prior de modo favorável a tanques", async mapName => {
    const { mapaApiDoCatalogo } = await import("./fixtures/mapaApi");
    const { rows, dados } = mapaApiDoCatalogo(mapName);
    // Simula o modelo anterior, sem referência, para provar a ligação no shared/draft.
    const semReferencia={...dados,estatisticasMapa:Object.fromEntries(Object.entries(dados.estatisticasMapa).map(([n,s])=>[n,{...s,referenciaMapa:undefined,jogosModo:10000,vitoriasModo:9900}]))};
    const lista=rankDraftEntries(rows,new Set(),"","Todos",{dadosApi:semReferencia,mapName,mapModeId:rows[0].modeId,mapReferenceRows:rows,pickNumber:1});
    const top=lista.filter(e=>!e.api?.bloqueado).slice(0,8);
    expect(top).toHaveLength(8);
    for (const r of top) expect(["Tank","Lançador","Assassino"]).not.toContain(getBrawlerClass(r.row.brawler));
  });
});
