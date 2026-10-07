import { afterEach, describe, expect, it } from "vitest";
import { calculateDraftSignal } from "@shared/draft";
import { setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import { defaultDraftRuleSettings, getWinRatePickWeight } from "@shared/draftRules";
import { calculateHybridScoresByMap } from "@shared/hybridScore";
import type { CounterSyncSnapshotPayload } from "@shared/counterSyncSnapshot";

/**
 * As regras do Draft à conversa umas com as outras.
 *
 * POR QUE ISTO EXISTE
 *
 * Cada regra tem o seu teste, e todos passavam. O que não tinha teste nenhum
 * era o que acontece quando duas se cruzam — e é aí que os erros deste motor
 * têm aparecido, sempre da mesma maneira: uma regra mexe nos Pontos Base, e
 * outra, que é uma PERCENTAGEM dos Pontos Base, muda de valor sem ninguém
 * ter mexido nela.
 *
 * Aconteceu de facto: pontos entraram no total sem chip visível, e a soma
 * deixou de bater certo com o que o ecrã explicava (2,1045 pontos que não
 * apareciam em lado nenhum). Um teste por regra não apanha isso, porque cada
 * regra, sozinha, está certa.
 *
 * Cada caso aqui cruza duas ou três, e verifica a propriedade que tem de
 * aguentar o cruzamento — não o número exato, que muda com as regras.
 */

const capturedAt = "2026-09-17T00:00:00.000Z";
const estado = { status: "success" as const, complete: true, fetchedAt: capturedAt, brawlers: ["Nori", "Gus", "Pearl"], relationCount: 1 };
const mapa = { map: "Flaring Phoenix", mode: "Nocaute", modeId: "knockout", tier: "S" as const, score: 70, winRate: 52, usage: 8 };
const nori = { ...mapa, brawler: "Nori", score: 72, winRate: 55 };
const gus = { ...mapa, brawler: "Gus" };
const pearl = { ...mapa, brawler: "Pearl" };
const composicaoDoMapa = [
  { map: "Flaring Phoenix", brawlers: ["Nori", "Gus", "Pearl"], winRate: 58, sourceUrl: "https://planet.test/mapa" },
];

function snapshotComDupla(): CounterSyncSnapshotPayload {
  return {
    schemaVersion: 2,
    capturedAt,
    absenceStreaks: {},
    activeBrawlers: ["Nori", "Gus", "Pearl"],
    sourceStates: { brawlscope: estado, calculator: estado, planet: estado, prodigy: estado },
    relations: [
      { owner: "Nori", direction: "targets", attacker: "Nori", defender: "Gus", source: "brawlscope", sourceUrl: "https://brawlscope.test/nori" },
    ],
    synergies: [
      { owner: "Nori", teammate: "Gus", rank: 1, source: "brawlscope", sourceUrl: "https://brawlscope.test/nori", delta: 10 },
      { owner: "Nori", teammate: "Gus", rank: 1, source: "planet", sourceUrl: "https://planet.test/nori", delta: 6 },
    ],
  };
}

/** A soma do que o ecrã mostra como chip, para comparar com o que o motor somou. */
function pontosDosChipsVisiveis(breakdown: ReturnType<typeof calculateDraftSignal>["scoreBreakdown"]) {
  return Math.max(0, breakdown.counterPoints)
    + breakdown.missingMidPoints
    + breakdown.missingSidePoints
    + breakdown.banPoints
    + breakdown.openingLongRangePoints
    + breakdown.synergyPoints
    + breakdown.mapTeamSynergyPoints;
}

// v168: a equipa tripla vem desligada; os testes que cruzam dupla e trio ligam-na.
const TRIPLA_LIGADA = { sinergiaDeEquipaTripla: 1 };

describe("regras do Draft a interagir", () => {
  afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));

  /**
   * A regra que já foi quebrada uma vez: todo o ponto somado tem de ter chip.
   *
   * Aqui com dupla E trio ao mesmo tempo, que é o cruzamento onde a conta
   * antes fugiu — o trio soma à dupla, e a soma passou a incluir pontos que o
   * ecrã não explicava.
   */
  it("com dupla e trio juntos, todo o ponto somado continua a ter chip visível", () => {
    setCounterSyncSnapshot(snapshotComDupla());
    const sinal = calculateDraftSignal(nori, {
      mapModeId: "knockout",
      mapName: "Flaring Phoenix",
      allyRows: [gus, pearl],
      mapTeams: composicaoDoMapa as never,
      pickNumber: 3,
      ruleSettings: TRIPLA_LIGADA,
    });

    expect(sinal.scoreBreakdown.synergyPoints).toBeGreaterThan(0);
    expect(sinal.scoreBreakdown.mapTeamSynergyPoints).toBeGreaterThan(0);
    expect(pontosDosChipsVisiveis(sinal.scoreBreakdown))
      .toBeCloseTo(sinal.scoreBreakdown.rawContextualBonusPoints, 6);
  });

  /**
   * Os fatores contextuais entram inteiros, seja qual for a Base.
   *
   * Aqui havia dois testes a guardar um tecto por estado de Draft: que ele era
   * uma proporção dos Pontos Base e não um número fixo, e que o corte era
   * declarado quando acontecia. O tecto saiu — as regras que se afinam no painel
   * do Draft passam a valer o que dizem.
   *
   * O que continua a valer a pena guardar é o que o tecto obrigava a explicar: a
   * conta tem de bater certo. O ajuste é a soma dos bónus menos a soma dos
   * desbónus, e o Score é a Base mais esse ajuste — com Base baixa ou alta.
   */
  it("o ajuste é a soma dos fatores, com Pontos Base baixos ou altos", () => {
    setCounterSyncSnapshot(snapshotComDupla());
    const contexto = { mapModeId: "knockout", allyRows: [gus], pickNumber: 2 as const };
    const baixo = calculateDraftSignal({ ...nori, score: 40 }, contexto);
    const alto = calculateDraftSignal({ ...nori, score: 90 }, contexto);

    expect(alto.scoreBreakdown.hybridPoints).toBeGreaterThan(baixo.scoreBreakdown.hybridPoints);
    for (const sinal of [baixo, alto]) {
      const { rawContextualBonusPoints, rawContextualPenaltyPoints, contextualAdjustment, hybridPoints } = sinal.scoreBreakdown;
      expect(contextualAdjustment).toBeCloseTo(rawContextualBonusPoints - rawContextualPenaltyPoints, 6);
      expect(sinal.draftScore).toBeCloseTo(hybridPoints + contextualAdjustment, 6);
    }
    /**
     * Os fatores são taxas sobre a Base, por isso a Base maior leva mais pontos
     * de ajuste — mas a mesma percentagem. É a proporcionalidade que o antigo
     * teste do tecto guardava, e que continua a ser verdade sem ele.
     */
    expect(alto.scoreBreakdown.contextualAdjustment).toBeGreaterThan(baixo.scoreBreakdown.contextualAdjustment);
    expect(alto.scoreBreakdown.contextualAdjustment / alto.scoreBreakdown.hybridPoints)
      .toBeCloseTo(baixo.scoreBreakdown.contextualAdjustment / baixo.scoreBreakdown.hybridPoints, 6);
  });

  /**
   * Nada é cortado, nem no cenário mais carregado do ficheiro.
   *
   * Este é o caso com dupla, trio e composição do mapa todos ativos ao mesmo
   * tempo — o que mais fatores acumula, e por isso o que o tecto mais cortava.
   */
  it("o cenário com mais fatores ativos chega inteiro ao Score", () => {
    setCounterSyncSnapshot(snapshotComDupla());
    const sinal = calculateDraftSignal(nori, {
      mapModeId: "knockout",
      mapName: "Flaring Phoenix",
      allyRows: [gus, pearl],
      mapTeams: composicaoDoMapa as never,
      pickNumber: 3,
    });
    const { rawContextualBonusPoints, rawContextualPenaltyPoints, contextualAdjustment } = sinal.scoreBreakdown;

    expect(rawContextualBonusPoints).toBeGreaterThan(0);
    expect(contextualAdjustment).toBeCloseTo(rawContextualBonusPoints - rawContextualPenaltyPoints, 6);
    expect(pontosDosChipsVisiveis(sinal.scoreBreakdown)).toBeCloseTo(rawContextualBonusPoints, 6);
    expect(sinal.draftScore).toBeCloseTo(sinal.scoreBreakdown.hybridPoints + contextualAdjustment, 6);
  });

  /**
   * A dupla continua a contar uma vez mesmo com o trio em cima.
   *
   * Foi a regra decidida: duas fontes que publicam a MESMA dupla medem a mesma
   * observação e contam uma vez, pela fonte prioritária; o trio mede outra
   * coisa — a composição naquele mapa — e por isso soma. Juntar as duas coisas
   * não pode fazer a dupla voltar a contar duas vezes.
   */
  it("o trio não faz a dupla voltar a contar duas vezes", () => {
    setCounterSyncSnapshot(snapshotComDupla());
    const base = { mapModeId: "knockout", mapName: "Flaring Phoenix", allyRows: [gus, pearl], pickNumber: 3 as const, ruleSettings: TRIPLA_LIGADA };
    const soDupla = calculateDraftSignal(nori, base);
    const comTrio = calculateDraftSignal(nori, { ...base, mapTeams: composicaoDoMapa as never });

    // A parte da dupla é a mesma nos dois: o trio acrescenta, não reabre.
    expect(comTrio.scoreBreakdown.synergyPoints).toBeCloseTo(soDupla.scoreBreakdown.synergyPoints, 6);
    expect(comTrio.bonusSources.synergySource).toBe("BrawlScope");
    expect(comTrio.scoreBreakdown.rawContextualBonusPoints)
      .toBeGreaterThan(soDupla.scoreBreakdown.rawContextualBonusPoints);
  });

  /**
   * A escada vitória/uso e a sinergia por pick sobem as duas com o número do
   * pick, e têm de continuar independentes uma da outra.
   *
   * Cruzá-las é o cenário de uso normal — o sexto pick tem a escada no topo E a
   * sinergia no topo — e é onde um engano de índice passaria despercebido,
   * porque as duas mexem no mesmo sentido.
   */
  it("a escada vitória/uso e a sinergia por pick não se contaminam", () => {
    setCounterSyncSnapshot(snapshotComDupla());
    const linhas = [
      { map: "Teste", brawler: "Piso", winRate: 0, usage: 0 },
      { map: "Teste", brawler: "Teto", winRate: 100, usage: 100 },
      { map: "Teste", brawler: "Nori", winRate: 60, usage: 40 },
    ];
    const pontosBase = (pick: number) => calculateHybridScoresByMap(linhas, getWinRatePickWeight(pick, defaultDraftRuleSettings))
      .find((linha) => linha.brawler === "Nori")!.score ?? 0;

    const taxas = [1, 2, 3, 4, 5, 6].map((pick) => {
      const sinal = calculateDraftSignal({ ...nori, score: pontosBase(pick) }, {
        mapModeId: "knockout", allyRows: [gus], pickNumber: pick,
      });
      return sinal.scoreBreakdown.configuredSynergyBonusRate;
    });

    // A taxa configurada de sinergia depende do PICK e de mais nada: mudar os
    // Pontos Base por baixo dela não a pode mexer.
    expect(taxas).toEqual([
      defaultDraftRuleSettings.synergyPick1,
      defaultDraftRuleSettings.synergyPick2,
      defaultDraftRuleSettings.synergyPick3,
      defaultDraftRuleSettings.synergyPick4,
      defaultDraftRuleSettings.synergyPick5,
      defaultDraftRuleSettings.synergyPick6,
    ]);
    // E a escada continua a mexer nos Pontos Base, senão o teste acima seria
    // verdadeiro por o cenário não ter mudado nada.
    expect(pontosBase(6)).not.toBeCloseTo(pontosBase(1), 6);
  });
});
