import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCounterSourceProfiles, getLiteralCounterRelations, setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calculateDraftSignal, getCounterProfile, inferDraftRole } from "@shared/draft";
import { getMatchupValue } from "@shared/counterMatchupValue";
import { defaultDraftRuleSettings } from "@shared/draftRules";
import { buildBanAudit, calculateDuelTeamScoreSummary, getActiveDraftBonuses, getDuelTeamScoreLeader } from "../client/src/pages/Draft";

// Estes testes auditam catálogos estáticos; produção continua a exigir snapshot live.
beforeEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));
afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: false }));

describe("chips de pontuação do Draft", () => {
  it("não cria um bónus separado de popularidade a partir da taxa de uso", () => {
    const rows = [
      { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53, topBrawlScore: 10, usage: 48 },
      { brawler: "Shelly", score: 63, tier: "A" as const, brawlPlanetWinRate: 51, topBrawlScore: 9, usage: 12 },
    ];
    const signal = calculateDraftSignal(rows[0], {
      popularityRows: rows,
      ruleSettings: { missingMid: 0, missingSide: 0, openingLongRange: 0 },
    });

    expect(getActiveDraftBonuses(signal, inferDraftRole("Brock"))).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Popularidade do mapa" }),
    ]));
    expect(signal.scoreBreakdown).not.toHaveProperty("popularityBonusPoints");
  });

  // O chip separado de Enemy Counter deixou de aparecer: o confronto desfavorável
  // é hoje o próprio Counter com sinal negativo, e mostrar os dois descontaria o
  // mesmo matchup duas vezes no cartão.
  it("apresenta o Desbônus Counter com o delta publicado do confronto", () => {
    const enemyCounter = getCounterProfile("Brock").counteredBy
      .find((name) => getMatchupValue("Brock", name).total < 0)!;
    const delta = getMatchupValue("Brock", enemyCounter).total;
    const signal = calculateDraftSignal(
      { brawler: "Brock", score: 69, tier: "A", brawlPlanetWinRate: 53 },
      {
        allyRows: [],
        enemyRows: [{ brawler: enemyCounter, score: 70, tier: "A", brawlPlanetWinRate: 53 }],
        isCandidateUnselected: true,
        topRecommendationNames: ["Brock"],
      },
    );
    const chips = getActiveDraftBonuses(signal, inferDraftRole("Brock"));

    expect(delta).toBeLessThan(0);
    expect(chips).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Desbônus Counter",
        rate: expect.closeTo(delta, 6),
        points: expect.closeTo(69 * (delta / 100), 6),
        source: expect.stringContaining(enemyCounter),
      }),
    ]));
    expect(chips.some((chip) => chip.label.startsWith("Desbônus Enemy Counter"))).toBe(false);
  });

  it("mostra nos chips o ajuste configurado que multiplica o delta de Counter", () => {
    const enemyCounter = getCounterProfile("Brock").counteredBy
      .find((name) => getMatchupValue("Brock", name).total < 0)!;
    const delta = getMatchupValue("Brock", enemyCounter).total;
    const signal = calculateDraftSignal(
      { brawler: "Brock", score: 69, tier: "A", brawlPlanetWinRate: 53 },
      {
        allyRows: [],
        enemyRows: [{ brawler: enemyCounter, score: 70, tier: "A", brawlPlanetWinRate: 53 }],
        isCandidateUnselected: true,
        topRecommendationNames: ["Brock"],
        // A percentagem configurável que sobrou é o multiplicador do delta; a taxa
        // por pick já não altera os pontos de Counter.
        ruleSettings: { counterPickMultiplier: 2 },
      },
    );

    expect(getActiveDraftBonuses(signal, inferDraftRole("Brock"))).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Desbônus Counter",
        rate: expect.closeTo(delta * 2, 6),
        points: expect.closeTo(69 * (delta / 100) * 2, 6),
        source: expect.stringContaining(`${enemyCounter} ${delta}%`),
      }),
    ]));
  });

  it("expõe regras percentuais configuráveis no resumo visual do Draft", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");

    expect(draftSource).toContain("Configurações das regras percentuais do Draft");
    expect(draftSource).toContain("ruleSettings: draftRuleSettings");
    expect(draftSource).toContain("draftRuleSettings.sameClassPenalty * 100");
    /*
     * Esta linha exigia `getCounterBonusRate(analysisGlobalPickNumber, ...)`,
     * com o comentário "a taxa continua a ser lida das regras configuráveis".
     * Já não é verdade, e não era há muito: o bónus de Counter é o delta
     * publicado do confronto vezes o ajuste do pick, e `counterPickN` não entra
     * em conta nenhuma — posto a 60, o ecrã prometia "+60% por matchup direto
     * literal" e o Score não mexia um decimal.
     *
     * O teste estava a guardar esse erro em vez de o apanhar. Passa a exigir o
     * que o Score faz mesmo: o ajuste do pick, que é o que de facto multiplica
     * a percentagem publicada.
     */
    expect(draftSource).toContain("getCounterPickMultiplier(analysisGlobalPickNumber, draftRuleSettings)");
    // A garantia de que o valor morto não volta a alimentar texto está em
    // `frasesDoPainel.test.ts`, que limpa os comentários antes de procurar —
    // aqui a fonte é lida crua, e o comentário que explica esta correção cita
    // o nome antigo de propósito, para o próximo leitor perceber o que mudou.
    expect(draftSource).toContain("rateFromContextualPoints(signal.scoreBreakdown.enemyCounterPenaltyPoints");
    expect(draftSource).toContain("label: `Risco Counter Top ${windowSize}`");
    expect(draftSource).toContain("rateFromContextualPoints(signal.scoreBreakdown.sameClassPenaltyPoints");
    expect(draftSource).toContain('title: "Sinergia por Pick"');
    expect(draftSource).toContain('key: "synergyPick1"');
    expect(draftSource).toContain('key: "synergyPick2"');
    expect(draftSource).toContain('key: "synergyPick3"');
    expect(draftSource).toContain('key: "synergyPick4"');
    expect(draftSource).toContain('key: "synergyPick5"');
    expect(draftSource).toContain('key: "synergyPick6"');
    expect(draftSource).not.toContain("rate: -5 * count");
    expect(draftSource).not.toContain("rate: -3 * count");
    expect(draftSource).toContain("regras percentuais");
    expect(draftSource).not.toContain("-7% por Enemy Counter");
  });

  it("soma e calcula a média dos Pontos Finais de Mid e Lanes por equipa", () => {
    expect(calculateDuelTeamScoreSummary([
      { blueScore: 80, redScore: 60 },
      { blueScore: 70, redScore: 80 },
      { blueScore: 90, redScore: 70 },
    ])).toEqual({
      blueTotal: 240,
      redTotal: 210,
      duelCount: 3,
      blueAverage: 80,
      redAverage: 70,
      difference: 30,
      bluePercentage: expect.closeTo(53.333333, 5),
      redPercentage: expect.closeTo(46.666667, 5),
    });
    expect(calculateDuelTeamScoreSummary([{ blueScore: 75, redScore: 75 }])).toEqual(expect.objectContaining({
      bluePercentage: 50,
      redPercentage: 50,
    }));
    expect(calculateDuelTeamScoreSummary([])).toEqual({
      blueTotal: 0,
      redTotal: 0,
      duelCount: 0,
      blueAverage: 0,
      redAverage: 0,
      difference: 0,
      bluePercentage: 0,
      redPercentage: 0,
    });

    expect(getDuelTeamScoreLeader(calculateDuelTeamScoreSummary([{ blueScore: 81, redScore: 74 }]))).toBe("blue");
    expect(getDuelTeamScoreLeader(calculateDuelTeamScoreSummary([{ blueScore: 74, redScore: 81 }]))).toBe("red");
    expect(getDuelTeamScoreLeader(calculateDuelTeamScoreSummary([{ blueScore: 75, redScore: 75 }]))).toBe("tie");
    expect(getDuelTeamScoreLeader(calculateDuelTeamScoreSummary([]))).toBeNull();

    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
    expect(draftSource).toContain("matchup-team-score-summary");
    expect(draftSource).toContain("REPARTIÇÃO DA SOMA");
    expect(draftSource).toContain("DETALHAMENTO DOS PONTOS");
    expect(draftSource).toContain("PONTOS FINAIS · AZUL");
    expect(draftSource).toContain("PONTOS FINAIS · VERMELHA");
    expect(draftSource).toContain("da soma");
    expect(draftSource).toContain("matchup-team-score-trophy");
    expect(draftSource).toContain("AZUL LIDERA");
    expect(draftSource).toContain("VERMELHA LIDERA");
    expect(draftSource).toContain("EMPATE 50/50");
  });

  it("expõe Pontos Base, Pontos Finais e Score Híbrido real no ranking visual", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");

    expect(draftSource).toContain("PONTOS BASE");
    expect(draftSource).toContain("PONTOS FINAIS");
    expect(draftSource).toContain("SCORE HÍBRIDO REAL");
    expect(draftSource).toContain("Base 100 corresponde ao melhor Score Híbrido disponível no mapa.");
    expect(draftSource).toContain("calculateNormalizedDraftPoints");
  });

  it("expõe a auditoria separada da janela, Enemy Counter, pressão e Counter Top", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");

    expect(draftSource).toContain("AUDITORIA DE COUNTERS");
    expect(draftSource).toContain("JANELA COUNTER TOP · TOP");
    expect(draftSource).toContain("ENEMY COUNTER DIRETO");
    expect(draftSource).toContain("PRESSÃO INIMIGA");
    expect(draftSource).toContain("COUNTER TOP");
    expect(draftSource).toContain("SEM COUNTER TOP NESTE CANDIDATO");
    expect(draftSource).toContain("getLiteralCounterRelations(windowBrawler, row.brawler)");
    expect(draftSource).toContain("Counter Top é apenas um aviso do mapa. Enemy Counter direto e Pressão Inimiga aplicam-se quando existem picks inimigos reais.");
    expect(draftSource).toContain("const activeCounterWindow = useMemo(() => topRecommendationNames.slice");
  });

  // ATENÇÃO: o painel "2 · RISCOS LITERAIS" foi removido do Draft.tsx — nenhuma
  // das frases que este teste guardava existe hoje em lado nenhum do cliente
  // (ver relatório). O que sobreviveu do comportamento é o chip de Counter Top,
  // e é sobre ele que o teste passa a incidir: o risco continua visível, mas com
  // taxa e pontos a zero, sem desbónus automático.
  it("mostra Counter Top como risco literal sem desbónus automático", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
    const candidate = { brawler: "Brock", score: 69, tier: "A" as const, brawlPlanetWinRate: 53 };
    const topCounter = getCounterProfile(candidate.brawler).counteredBy
      .find((name) => getMatchupValue(candidate.brawler, name).total < 0
        && getLiteralCounterRelations(name, candidate.brawler).length > 0)!;
    const signal = calculateDraftSignal(candidate, {
      allyRows: [],
      enemyRows: [],
      isCandidateUnselected: true,
      completedPickCount: 0,
      topRecommendationNames: [topCounter],
      counterPenaltyEligibleNames: [topCounter],
    });
    const chips = getActiveDraftBonuses(signal, inferDraftRole(candidate.brawler));

    expect(topCounter).toBeDefined();
    expect(draftSource).toContain("label: `Risco Counter Top ${windowSize}`");
    expect(draftSource).not.toContain("não aplica Counter Top neste cenário");
    expect(signal.bonusSources.topTwentyCounters).toContain(topCounter);
    expect(signal.scoreBreakdown.topTwentyCounterPenaltyPoints).toBe(0);
    expect(chips).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: `Risco Counter Top ${signal.scoreBreakdown.topCounterWindowSize}`,
        rate: 0,
        points: 0,
        source: `aviso sem desbónus: ${topCounter}`,
      }),
    ]));
  });

  it("apresenta no chip as taxas de Counter e Sinergia do pick global", () => {
    const counterTarget = getCounterProfile("Brock").counters[0]!;
    const counterSignal = calculateDraftSignal(
      { brawler: "Brock", score: 69, tier: "A", brawlPlanetWinRate: 53 },
      { enemyRows: [{ brawler: counterTarget, score: 70, tier: "A", brawlPlanetWinRate: 53 }], pickNumber: 2 },
    );
    const synergySignal = calculateDraftSignal(
      { brawler: "Brock", score: 69, tier: "A", brawlPlanetWinRate: 53 },
      { allyRows: [{ brawler: "Gene", score: 70, tier: "A", brawlPlanetWinRate: 53 }], pickNumber: 3 },
    );

    // O chip deixou de anunciar a taxa do pick: mostra o delta publicado do
    // confronto e, na Sinergia, a percentagem publicada para o par com a fonte
    // que a sustenta. A taxa por pick continua a existir nas regras, mas já não é
    // ela que faz os pontos.
    const counterDelta = getMatchupValue("Brock", counterTarget).total;
    expect(counterDelta).toBeGreaterThan(0);
    expect(getActiveDraftBonuses(counterSignal, inferDraftRole("Brock"))).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Counter",
        rate: expect.closeTo(counterDelta, 6),
        points: expect.closeTo(69 * (counterDelta / 100), 6),
        source: expect.stringContaining(counterTarget),
      }),
    ]));
    // A percentagem do par vem da ficha publicada, não do resultado do motor.
    const published = getCounterSourceProfiles("Brock")
      .flatMap((profile) => profile.bestTeammates.map((relation) => ({ ...relation, source: profile.source })))
      .find((relation) => relation.brawler === "Gene")!;
    expect(published?.delta).toBeGreaterThan(0);
    expect(synergySignal.scoreBreakdown.hasPublishedSynergyRate).toBe(true);
    expect(getActiveDraftBonuses(synergySignal, inferDraftRole("Brock"))).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: `Sinergia · ${published.source}`,
        rate: expect.closeTo(published.delta!, 6),
        points: expect.closeTo(69 * (published.delta! / 100), 6),
        source: expect.stringContaining("Gene"),
      }),
    ]));
  });

  it("explica no cartão quando um Counter unitário já está coberto por um aliado", () => {
    const signal = calculateDraftSignal(
      { brawler: "Brock", score: 69, tier: "A", brawlPlanetWinRate: 53 },
      {
        allyRows: [{ brawler: "Angelo", score: 80, tier: "S", brawlPlanetWinRate: 56 }],
        enemyRows: [{ brawler: "Bea", score: 70, tier: "A", brawlPlanetWinRate: 53 }],
        pickNumber: 1,
      },
    );

    /**
     * Este chip dizia "sem bónus repetido" e o Score pagava o bónus na mesma —
     * o teste guardava a mentira em vez de a apanhar, porque só comparava o
     * texto com ele próprio. Agora diz o que acontece, e com a regra desligada
     * (o padrão) o que acontece é o bónus ser pago.
     */
    expect(getActiveDraftBonuses(signal, inferDraftRole("Brock"))).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Counter já coberto · bónus mantido",
        rate: 0,
        points: 0,
        source: "Bea já counterado por Angelo · o delta deste par é teu e conta na mesma",
      }),
    ]));
    expect(signal.scoreBreakdown.counterPoints).toBeGreaterThan(0);
  });

  it("expõe o risco literal da janela Top 16 sem alterar o Score antes de picks", () => {
    const literalCounters = getCounterProfile("Brock").counteredBy.slice(0, 2);
    const signal = calculateDraftSignal(
      { brawler: "Brock", score: 69, tier: "A", brawlPlanetWinRate: 53 },
      {
        allyRows: [],
        enemyRows: [],
        completedPickCount: 1,
        isCandidateUnselected: true,
        topRecommendationNames: ["Brock", ...literalCounters],
      },
    );

    expect(getActiveDraftBonuses(signal, inferDraftRole("Brock"))).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Risco Counter Top 16",
        rate: 0,
        points: 0,
        source: `aviso sem desbónus: ${literalCounters.join(", ")}`,
      }),
    ]));
  });

  it("apresenta a taxa oficial de pressão quando um inimigo também countera um aliado já escolhido", () => {
    const candidate = "Brock";
    const pressureEnemy = getCounterProfile(candidate).counteredBy.find((enemy) =>
      getCounterProfile(enemy).counters.some((target) => target !== candidate),
    );
    expect(pressureEnemy).toBeDefined();
    const pressureAlly = getCounterProfile(pressureEnemy!).counters.find((target) => target !== candidate);
    expect(pressureAlly).toBeDefined();
    const signal = calculateDraftSignal(
      { brawler: candidate, score: 69, tier: "A", brawlPlanetWinRate: 53 },
      {
        allyRows: [{ brawler: pressureAlly!, score: 70, tier: "A", brawlPlanetWinRate: 53 }],
        enemyRows: [{ brawler: pressureEnemy!, score: 70, tier: "A", brawlPlanetWinRate: 53 }],
        isCandidateUnselected: true,
        topRecommendationNames: [candidate],
      },
    );

    expect(getActiveDraftBonuses(signal, inferDraftRole(candidate))).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Pressão Enemy Counter",
        rate: -(defaultDraftRuleSettings.repeatedEnemyCounterPressure * 100),
        points: -(69 * defaultDraftRuleSettings.repeatedEnemyCounterPressure),
        source: `${pressureEnemy}: ${pressureAlly}`,
      }),
    ]));
  });

  it("explica nas informações de bónus se a abertura veio do alcance ou de uma exceção", () => {
    const rangeSignal = calculateDraftSignal(
      { brawler: "Brock", score: 69, tier: "A", brawlPlanetWinRate: 53 },
      { allyRows: [], enemyRows: [], pickNumber: 1, topRecommendationNames: ["Brock"] },
    );
    const exceptionSignal = calculateDraftSignal(
      { brawler: "Gene", score: 69, tier: "A", brawlPlanetWinRate: 53 },
      { allyRows: [], enemyRows: [], pickNumber: 1, topRecommendationNames: ["Gene"] },
    );

    expect(getActiveDraftBonuses(rangeSignal, inferDraftRole("Brock"), "Brock")).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Abertura", source: "ataque principal ≥6 blocos · Pick 1" }),
    ]));
    expect(getActiveDraftBonuses(exceptionSignal, inferDraftRole("Gene"), "Gene")).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Abertura", source: "exceção tática: Eugenio · Pick 1" }),
    ]));
  });
});

describe("tabela de alcance", () => {
  it("identifica visualmente os brawlers elegíveis para o bónus de abertura", () => {
    const brawlersSource = readFileSync(resolve(process.cwd(), "client/src/pages/Brawlers.tsx"), "utf8");
    const cssSource = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

    expect(brawlersSource).toContain("Bónus abertura");
    expect(brawlersSource).toContain("isOpeningLongRangeEligible(item.brawler)");
    expect(brawlersSource).toContain("openingBonusRate * 100");
    expect(brawlersSource).toContain("openingBonusRate={draftRules.openingLongRange}");
    expect(brawlersSource).toContain("getOpeningBonusEligibilityLabel(item.brawler)");
    expect(brawlersSource).toContain("opening-bonus-pill");
    expect(cssSource).toContain(".opening-bonus-pill");
    expect(cssSource).toContain(".opening-bonus-pill.is-inactive");
  });
});

describe("atualização prioritária do Draft", () => {
  it("confirma o Pick antes de recalcular o painel contextual", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");

    expect(draftSource).toContain('import { Fragment, memo, startTransition');
    expect(draftSource).toMatch(/const \[analysisChoices, setAnalysisChoices\] = useState/);
    expect(draftSource).toContain('const analysisRefreshFrameRef = useRef<number | null>(null);');
    expect(draftSource).toContain('const scheduleContextualAnalysis = useCallback');
    expect(draftSource).toContain('requestAnimationFrame(() => {');
    expect(draftSource).toContain('cancelAnimationFrame(analysisRefreshFrameRef.current)');
    expect(draftSource).toMatch(/setChoices\(nextChoices\);\s*setSelectedStepIndex\(null\);\s*scheduleContextualAnalysis\(nextChoices, currentSkipped, null\)/);
    expect(draftSource).toContain('scheduleContextualAnalysis(choices, nextSkipped, null);');
    expect(draftSource).toContain('scheduleContextualAnalysis(nextChoices, nextSkipped, index);');
    expect(draftSource).toContain('selectionLockedNames={lockedNames}');
    expect(draftSource).toContain('const DraftCard = memo(function DraftCard');
    expect(draftSource).toContain('completedPickCount={analysisCompletedPickCount}');
    expect(draftSource).toContain('getDraftCounterWindow(currentRows, analysisLockedNames, "", baseRoleContext)');
    expect(draftSource).toContain('counterPenaltyEligibleNames: counterWindow.counterPenaltyEligibleNames');
    expect(draftSource).toContain('rankDraftEntries(currentRows, analysisLockedNames, "", "Todos", roleContext)');
    expect(draftSource).toContain('const visibleRankedEntries = useMemo');
    expect(draftSource).toContain('const pagedRankedEntries = useMemo(() => visibleRankedEntries.slice');
    expect(draftSource).toContain('const activeCounterWindow = useMemo(() => topRecommendationNames.slice');
    expect(draftSource).toContain('activeCounterWindow={activeCounterWindow}');
    expect(draftSource).toContain('<QuickPickRail activeStep={activeDraftStep} entries={rankedDraftEntries}');
    expect(draftSource).not.toContain('rankDraftEntries(rows, lockedNames');
    expect(draftSource).toContain('entry.draftScore');
    expect(draftSource).toContain('entry.rank');
    expect(draftSource).toContain('const globalTopEntry = rankedDraftEntries[0];');
    const cssSource = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(cssSource).toContain('content-visibility: auto');
    expect(cssSource).toContain('contain-intrinsic-size: auto 420px');
    // A lista de dependências cresce quando aparece um filtro novo — a última a
    // entrar foi a ordenação. O que este teste guarda é a propriedade, não a
    // lista literal: mudar o que se vê volta a pôr a paginação no início.
    const resetDaPagina = /useEffect\(\(\) => \{ setRosterPage\(1\); \}, \[([^\]]*)\]\);/.exec(draftSource);
    expect(resetDaPagina).not.toBeNull();
    for (const dependencia of ["rankedDraftEntries", "query", "roleFilter"]) {
      expect(resetDaPagina![1]).toContain(dependencia);
    }
    expect(draftSource).toMatch(/const assignBrawler[\s\S]*?setRosterPage\(1\);\s*setChoices\(nextChoices\)/);
    expect(draftSource).toContain('completedPickCount, topRecommendationNames, counterPenaltyEligibleNames, experimentalWeights');
    expect(draftSource).toContain('pickNumber, completedPickCount, topRecommendationNames, counterPenaltyEligibleNames, experimentalWeights');
    expect(draftSource).toContain('completedPickCount={analysisCompletedPickCount} topRecommendationNames={topRecommendationNames} counterPenaltyEligibleNames={counterWindow.counterPenaltyEligibleNames}');
    const engineSource = readFileSync(resolve(process.cwd(), "shared/draft.ts"), "utf8");
    expect(engineSource).not.toContain('const counterProfile = getCounterProfile(row.brawler);');
  });
});

describe("dica contextual dos Picks", () => {
  it("liga o hover apenas aos Picks e apresenta as duas fontes de win rate e a sinergia literal", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");

    expect(draftSource).toContain('import { HoverCard, HoverCardContent, HoverCardTrigger }');
    expect(draftSource).toContain('if (step.kind !== "pick") return slotButton;');
    expect(draftSource).toContain('Win Rate Brawl Planet');
    expect(draftSource).toContain('Win Rate TopBrawl');
    expect(draftSource).toContain('findBrawlPlanetMapTeam(row.brawler, teammateNames, mapTeams)');
    expect(draftSource).toContain('Sinergia de equipa confirmada');
  });
});

describe("Dashboard de fontes com seis destaques", () => {
  it("restaura os menus individuais e seis brawlers, mantendo um único Full Source Readout completo", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

    expect(homeSource).toContain('type SourceTab = "topbrawl" | "brawlplanet" | "hybrid";');
    expect(homeSource).toContain('label: "TopBrawl"');
    expect(homeSource).toContain('label: "Brawl Planet"');
    expect(homeSource).toContain('label: "Score Híbrido"');
    expect(homeSource).toContain("source-tabs");
    expect(homeSource).toContain("source-card-grid");
    expect(homeSource).toContain("featureRows.map");
    expect(homeSource).toContain("source-full-readout");
    expect(homeSource).toContain("sourceRows.map((row, index)");
    expect(homeSource).toContain('placeholder="Procurar brawler no Full Source Readout..."');
    expect(homeSource).not.toContain("Gestão Manual de Fontes");
    expect(homeSource).not.toContain("Full matrix");
    expect(homeSource).not.toContain("Hot picks");
    expect(homeSource).toContain('onExplore={() => scrollTo("maps")}');
    expect(homeSource).not.toContain('scrollTo("brawlers")');
  });
});

describe("aviso de novidades na rotação", () => {
  it("liga o painel ao estado do roster e nunca o mostra sem novidades", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");

    // O painel é alimentado pela snapshot, e não por uma lista escrita à mão.
    expect(draftSource).toContain("<RosterWatchPanel roster={rankedSync.snapshot?.roster} />");
    expect(draftSource).toContain('import { leavingEntries, quarantinedEntries, type RosterEntry, type RosterState } from "@shared/rosterDiscovery";');
    // Sem nada a assinalar, não ocupa espaço no ecrã.
    expect(draftSource).toContain("if (!novos.length && !novosBrawlers.length && !aSairMapas.length && !aSairBrawlers.length) return null;");
    // E diz o que falta a cada novidade, em vez de a esconder sem explicação.
    expect(draftSource).toContain("entry.missing?.length ? <em>falta: {entry.missing.join(\", \")}</em> : null");
  });
});

describe("arrumação da página do Draft", () => {
  const draftSource = () => readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");

  it("trocou o hero de página de apresentação por uma barra de contexto", () => {
    const source = draftSource();

    // O hero ocupava 310px no telemóvel antes de qualquer coisa útil.
    expect(source).not.toContain('<section className="draft-hero">');
    expect(source).toContain('<section className="draft-contextbar"');
    // E mostra o que muda a cada turno, não uma frase fixa.
    expect(source).toContain("{selectedMap?.name ?? \"Sem mapa\"}");
    expect(source).toContain("{activeDraftStep ? activeDraftStep.label : \"—\"}");
  });

  it("põe o tabuleiro antes dos painéis de configuração", () => {
    const source = draftSource();
    const tabuleiro = source.indexOf('<div className="draft-content"');
    const regras = source.indexOf("<DraftRulesPanel");
    const novidades = source.indexOf("<RosterWatchPanel");

    expect(tabuleiro).toBeGreaterThan(0);
    // O que se usa em cada draft vem antes do que se configura uma vez.
    expect(tabuleiro).toBeLessThan(regras);
    expect(tabuleiro).toBeLessThan(novidades);
  });

  it("colapsa os painéis de consulta, sem esconder nada", () => {
    const source = draftSource();

    expect(source).toContain("function FoldPanel(");
    // Fechado continua a dizer alguma coisa, em vez de virar um título mudo.
    expect(source).toContain("{summary ? <small>{summary}</small> : null}");
    expect(source).toContain('title="Leitura das fontes"');
    expect(source).toContain('title="Rotação oficial"');
  });

  it("anima o número em vez de o trocar de repente, e respeita quem pediu sossego", () => {
    const source = draftSource();

    expect(source).toContain("function CountUp(");
    expect(source).toContain('window.matchMedia?.("(prefers-reduced-motion: reduce)").matches');
    expect(source).toContain("<CountUp value={mapHybridReference} />");
    // A lista evita medir todos os cartões a cada escolha.
    expect(source).not.toContain("<motion.div layout");
  });
});

describe("direção dos cursores de peso", () => {
  /**
   * Um cursor cresce para a direita. Se o número que ele controla estiver
   * desenhado à esquerda, arrasta-se na direção de um rótulo e sobe o outro —
   * foi exatamente esta a queixa. A regra é uma só: o valor que o cursor mede
   * fica do lado para onde o cursor cresce.
   */
  const homeSource = () => readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

  it("põe o TopBrawl à direita, que é o valor que o cursor mede", () => {
    const source = homeSource();
    const esquerda = source.indexOf("<span>Brawl Planet</span>");
    const cursor = source.indexOf("value={[sourceBalance.topBrawl]}");
    const direita = source.indexOf("<span>TopBrawl</span>");

    expect(esquerda).toBeGreaterThan(0);
    expect(esquerda).toBeLessThan(cursor);
    expect(cursor).toBeLessThan(direita);
  });

  it("aplica a mesma regra ao cursor Vitória/Uso, para as convenções não se contradizerem", () => {
    const source = homeSource();
    const esquerda = source.indexOf("<span>Taxa de uso</span>");
    const cursor = source.indexOf("value={[winRateWeight]}");
    const direita = source.indexOf("<span>Taxa de vitória</span>");

    expect(esquerda).toBeGreaterThan(0);
    expect(esquerda).toBeLessThan(cursor);
    expect(cursor).toBeLessThan(direita);
  });

  it("descreve a direção em voz alta, para quem usa leitor de ecrã", () => {
    const source = homeSource();
    expect(source).toContain('aria-label="Equilíbrio entre fontes: arrastar para a direita dá mais peso ao TopBrawl"');
    expect(source).toContain('aria-label="Pesos do Score: arrastar para a direita dá mais peso à taxa de vitória"');
  });
});

describe("o tema chega mesmo aos componentes", () => {
  /**
   * O erro que isto impede: da primeira vez escrevi um sistema de design
   * completo — `.bh-piece`, `.bh-action` — e não o liguei a nenhum elemento.
   * Classes definidas, zero componentes a usá-las. O site publicado ficou
   * exatamente igual ao anterior, e CSS morto não dá erro nenhum.
   */
  const css = () => readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

  it("dá tratamento de peça aos elementos que se clicam", () => {
    const source = css();

    for (const seletor of [".draft-slot", ".draft-recommendation"]) {
      // A última declaração é a que vale na cascata: é a sobreposição do tema,
      // não a regra original que existia antes dele.
      const inicio = source.lastIndexOf(`\n${seletor} {`);
      expect(inicio).toBeGreaterThan(0);
      const regra = source.slice(inicio, inicio + 400);
      expect(regra).toContain("border-bottom");
      expect(regra).toContain("var(--bh-edge)");
    }
    // E o gesto de afundar ao carregar, que é o que faz parecer um botão real.
    expect(source).toContain(".draft-slot:active:not(:disabled) { transform: translateY(2px)");
  });

  it("reserva o âmbar para a ação principal e para a posição no ranking", () => {
    const source = css();

    const inicio = source.lastIndexOf("\n.refresh-button {");
    expect(inicio).toBeGreaterThan(0);
    expect(source.slice(inicio, inicio + 400)).toContain("background: var(--bh-gold)");
    expect(source).toContain(".recommendation-rank, .quick-pick-rank { color: var(--bh-gold); }");
  });

  it("não deixa a grelha de duas colunas voltar sem os conflitos resolvidos", () => {
    /**
     * A grelha partiu o Draft porque `order: -3 / -2 / -1` continua a valer num
     * grid e as margens de 7,2% passavam a ser aplicadas dentro de cada coluna.
     * Foi retirada; se voltar, tem de ser com esses dois pontos tratados.
     */
    const source = css();
    expect(source).not.toContain("grid-template-columns: minmax(0, 1.55fr)");
    expect(source).toContain("Duas colunas: REMOVIDO");
  });
});

describe("cartões de mapa e navegação no telemóvel", () => {
  const homeSource = () => readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = () => readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

  it("substitui a seta fixa por uma comparação verdadeira", () => {
    /**
     * O cartão tinha um "↗" ao lado do top score que apontava sempre para cima,
     * em todos os mapas. Não indicava tendência nenhuma — era decoração a fingir
     * informação, que é pior do que não mostrar nada.
     */
    const source = homeSource();

    expect(source).not.toContain("top score <span>↗</span>");
    expect(source).toContain("map-card-delta");
    expect(source).toContain("desvio >= 0 ?");
    // E a comparação é contra a média da rotação, calculada dos dados em memória.
    expect(source).toContain("const desvio = map.topScore - mapInsights.media;");
  });

  it("mostra o melhor brawler de cada mapa", () => {
    const source = homeSource();
    expect(source).toContain('<em>Melhor aqui</em>');
    expect(source).toContain("mapInsights.melhorPorMapa.get(map.name)");
  });

  it("dá navegação ao Draft no telemóvel, que não tinha nenhuma", () => {
    /**
     * Em ecrãs pequenos a barra lateral sai do ecrã. O Início tinha botão para a
     * reabrir; o Draft não tinha nada — quem o abrisse no telemóvel ficava sem
     * forma de ir a lado nenhum.
     */
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");

    expect(draftSource).toContain('<MobileNav pathname="/draft" />');
    expect(homeSource()).toContain('<MobileNav pathname="/" />');
  });

  it("usa alvos que um polegar acerta", () => {
    const source = css();
    const bloco = source.slice(source.indexOf("@media (max-width: 900px) {\n  .mobile-nav {"));

    expect(bloco).toContain("min-height: 56px");
    // Os controlos usados durante uma partida sobem para 44px.
    expect(source).toContain(".refresh-button, .draft-slot, .roster-pagination button { min-height: 44px; }");
    // E a barra não pode tapar o fim da página nem a zona do gesto do sistema.
    expect(source).toContain("padding-bottom: env(safe-area-inset-bottom, 0)");
    expect(source).toContain(".app-main, .draft-shell { padding-bottom: 72px; }");
  });

  it("põe os cartões de mapa numa coluna e revela a ação sem depender do rato", () => {
    const source = css();
    const bloco = source.slice(source.indexOf("@media (max-width: 900px) {\n  .mobile-nav {"));

    expect(bloco).toContain(".map-strip { grid-template-columns: 1fr; }");
    // Sem rato não há hover: a ação tem de estar sempre visível.
    expect(bloco).toContain(".map-card-action { position: static; opacity: 1;");
  });
});

/**
 * O bónus de Ban tem de falar mesmo quando não paga.
 *
 * A queixa foi direta: "o bónus do ban tem que aparecer mensagem". Aparecia
 * apenas como chip, e só no caso em que as duas condições se reuniam. Nos
 * outros casos o cartão ficava calado — e um bónus calado é indistinguível de
 * um bónus avariado.
 */
describe("auditoria de bans no cartão do Draft", () => {
  const row = (brawler: string) => ({ brawler, score: 70, tier: "A" as const, brawlPlanetWinRate: 55 });

  it("classifica um ban que paga bónus", () => {
    const counterDoBrock = getCounterProfile("Brock").counteredBy[0]!;
    const signal = calculateDraftSignal(row("Brock"), {
      enemyRows: [],
      pickNumber: 1,
      bannedNames: new Set([counterDoBrock]),
      baseHybridTop25Names: new Set([counterDoBrock]),
    });

    const audit = buildBanAudit(signal, "Brock");
    expect(audit.registered).toContain(counterDoBrock);
    expect(audit.paying).toContain(counterDoBrock);
    expect(audit.outsideTop25).toHaveLength(0);
    expect(audit.notCounters).toHaveLength(0);
  });

  it("diz porque é que um ban não paga: fora do Top 25 do mapa", () => {
    const counterDoBrock = getCounterProfile("Brock").counteredBy[0]!;
    const signal = calculateDraftSignal(row("Brock"), {
      enemyRows: [],
      pickNumber: 1,
      bannedNames: new Set([counterDoBrock]),
      baseHybridTop25Names: new Set<string>(),
    });

    const audit = buildBanAudit(signal, "Brock");
    expect(signal.scoreBreakdown.banPoints).toBe(0);
    expect(audit.registered).toContain(counterDoBrock);
    expect(audit.outsideTop25).toContain(counterDoBrock);
    expect(audit.paying).toHaveLength(0);
  });

  it("diz porque é que um ban não paga: não countera este candidato", () => {
    const naoCountera = getCounterProfile("Brock").counters.find((name) =>
      !getCounterProfile("Brock").counteredBy.includes(name))!;
    const signal = calculateDraftSignal(row("Brock"), {
      enemyRows: [],
      pickNumber: 1,
      bannedNames: new Set([naoCountera]),
      baseHybridTop25Names: new Set([naoCountera]),
    });

    const audit = buildBanAudit(signal, "Brock");
    expect(audit.registered).toContain(naoCountera);
    expect(audit.notCounters).toContain(naoCountera);
    expect(audit.paying).toHaveLength(0);
    // A mensagem tem de nomear o brawler, senão não se sabe de quem se fala.
    expect(audit.aria).toContain("Brock");
  });

  it("sem bans registados não inventa nenhuma das três listas", () => {
    const audit = buildBanAudit(calculateDraftSignal(row("Brock"), { enemyRows: [], pickNumber: 1 }), "Brock");
    expect(audit.registered).toHaveLength(0);
    expect(audit.paying).toHaveLength(0);
    expect(audit.outsideTop25).toHaveLength(0);
    expect(audit.notCounters).toHaveLength(0);
    expect(audit.aria).toContain("Nenhum ban registado");
  });

  it("o bloco de auditoria de bans está sempre no cartão, não só quando o bónus paga", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
    expect(draftSource).toContain("AUDITORIA DE BANS");
    expect(draftSource).toContain("BANS REGISTADOS");
    expect(draftSource).toContain("BAN SEM BÓNUS · FORA DO TOP 25");
    expect(draftSource).toContain("BAN SEM BÓNUS · NÃO COUNTERA");
    // Renderizado sem condição: nada de `banAudit.registered.length && <span`.
    expect(draftSource).not.toMatch(/banAudit\.registered\.length\s*&&\s*</);
  });
});

/**
 * O painel de estado das fontes.
 *
 * A pergunta que o obrigou a existir: "já se passaram horas e os counters não
 * atualizaram". O servidor sabia porquê — cada fonte grava uma nota — mas essa
 * nota nunca chegava ao ecrã. Sem ela, uma recolha parada e uma recolha a
 * funcionar tinham exatamente o mesmo aspeto.
 */
describe("estado das fontes no Draft", () => {
  it("o painel existe e é alimentado pelo estado real das fontes, não por texto fixo", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");

    expect(draftSource).toContain("SourceHealthPanel");
    expect(draftSource).toContain("Estado das fontes");
    // Alimentado pelo endpoint, não por uma constante escrita à mão.
    expect(draftSource).toMatch(/sourceStates=\{[^}]*counterStatusQuery\.data/);
    expect(draftSource).toMatch(/health=\{[^}]*counterStatusQuery\.data/);
  });

  it("a nota de cada fonte é renderizada, que é a parte que responde à pergunta", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
    expect(draftSource).toContain("source-health-note");
    expect(draftSource).toContain("readableSourceNote(estado.note)");
  });

  it("o painel tem estilos próprios — a paginação já tinha ficado sem nenhum uma vez", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    for (const classe of [".source-health-list", ".source-health-row", ".source-health-badge", ".source-health-note"]) {
      expect(css).toContain(classe);
    }
  });
});
