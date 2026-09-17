import { describe, expect, it } from "vitest";
import { findBrawlPlanetMapTeam, type BrawlPlanetMapTeam } from "@shared/brawlPlanetMapTeams";
import { calculateDraftSignal } from "@shared/draft";
import { defaultDraftRuleSettings } from "@shared/draftRules";

const pitStopTeams: BrawlPlanetMapTeam[] = [
  {
    map: "Pit Stop",
    brawlers: ["Gus", "Chester", "Lily"],
    winRate: 85.6,
    sourceUrl: "https://www.brawlplanet.com/maps/pitstop_heist",
  },
  {
    map: "Pit Stop",
    brawlers: ["Tara", "Gus", "Lumi"],
    winRate: 80.2,
    sourceUrl: "https://www.brawlplanet.com/maps/pitstop_heist",
  },
];

const gus = { map: "Pit Stop", mode: "Roubo", modeId: "heist", brawler: "Gus", score: 72, winRate: 55, usage: 8 };
const chester = { map: "Pit Stop", mode: "Roubo", modeId: "heist", brawler: "Chester", score: 70, winRate: 52, usage: 8 };

const flaringPhoenixTeams: BrawlPlanetMapTeam[] = [
  {
    map: "Flaring Phoenix",
    brawlers: ["Brock", "Pearl", "Bolt"],
    winRate: 89.2,
    sourceUrl: "https://www.brawlplanet.com/maps/flaringphoenix_knockout",
  },
];

const brock = { map: "Flaring Phoenix", mode: "Nocaute", modeId: "knockout", brawler: "Brock", score: 72, winRate: 55, usage: 8 };
const pearl = { map: "Flaring Phoenix", mode: "Nocaute", modeId: "knockout", brawler: "Pearl", score: 70, winRate: 52, usage: 8 };
const bolt = { map: "Flaring Phoenix", mode: "Nocaute", modeId: "knockout", brawler: "Bolt", score: 68, winRate: 51, usage: 8 };

describe("sinergia Brawl Planet por mapa", () => {
  it("encontra apenas uma equipa literal que contenha candidato e Pick aliado", () => {
    expect(findBrawlPlanetMapTeam("Gus", ["Chester"], pitStopTeams)).toMatchObject({
      brawlers: ["Gus", "Chester", "Lily"],
      winRate: 85.6,
    });
    expect(findBrawlPlanetMapTeam("Gus", ["Spike"], pitStopTeams)).toBeNull();
  });

  it("aplica a taxa oficial para a composição literal do mapa e não acumula Best Teammate global", () => {
    const signal = calculateDraftSignal(gus, { allyRows: [chester], mapTeams: pitStopTeams });

    expect(signal.scoreBreakdown.mapTeamSynergyPoints).toBeCloseTo(signal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.synergyPick1);
    expect(signal.scoreBreakdown.synergyPoints).toBe(0);
    expect(signal.bonusSources.mapTeamSynergy).toMatchObject({ map: "Pit Stop", winRate: 85.6 });
    expect(signal.reasons.join(" ")).toContain(`Bónus Composição do mapa +${defaultDraftRuleSettings.synergyPick1 * 100}%`);
  });

  it("dá a taxa oficial a Pearl e Bolt quando Brock completa a composição Ranked de Flaring Phoenix", () => {
    const pearlSignal = calculateDraftSignal(pearl, { allyRows: [brock], mapTeams: flaringPhoenixTeams });
    const boltSignal = calculateDraftSignal(bolt, { allyRows: [brock], mapTeams: flaringPhoenixTeams });

    expect(pearlSignal.scoreBreakdown.mapTeamSynergyPoints).toBeCloseTo(pearlSignal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.synergyPick1);
    expect(boltSignal.scoreBreakdown.mapTeamSynergyPoints).toBeCloseTo(boltSignal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.synergyPick1);
    expect(pearlSignal.bonusSources.mapTeamSynergy?.brawlers).toEqual(["Brock", "Pearl", "Bolt"]);
    expect(boltSignal.bonusSources.mapTeamSynergy?.brawlers).toEqual(["Brock", "Pearl", "Bolt"]);
  });

  it("aplica a matriz oficial de Sinergia à composição literal do mapa em todos os picks", () => {
    const signals = [1, 2, 3, 4, 5, 6].map((pickNumber) => calculateDraftSignal(pearl, {
      allyRows: [brock],
      mapTeams: flaringPhoenixTeams,
      pickNumber,
    }));

    const expectedRates = [
      defaultDraftRuleSettings.synergyPick1,
      defaultDraftRuleSettings.synergyPick2,
      defaultDraftRuleSettings.synergyPick3,
      defaultDraftRuleSettings.synergyPick4,
      defaultDraftRuleSettings.synergyPick5,
      defaultDraftRuleSettings.synergyPick6,
    ];
    /**
     * A taxa publicada ganha à escada por pick — mas só quando existe.
     *
     * Este assert pedia uma taxa CONSTANTE, o que vale quando a fonte publica a
     * percentagem do par ("Pair with"). Esta composição não publica nenhuma: é
     * uma equipa de mapa do Brawl Planet, com taxa de vitória da equipa e sem
     * percentagem por par. Sem número publicado, a taxa efetiva é a escada —
     * que é exatamente o que as duas asserções seguintes confirmam, e por isso
     * exigir uma taxa constante aqui contradizia o resto do próprio teste.
     *
     * A taxa publicada tem cobertura própria no teste do par acima.
     */
    const taxasEfetivas = signals.map((signal) => signal.scoreBreakdown.synergyBonusRate);
    expect(taxasEfetivas).toEqual(expectedRates);
    expect(signals.map((signal) => signal.scoreBreakdown.configuredSynergyBonusRate)).toEqual(expectedRates);
    expectedRates.forEach((rate, index) => {
      expect(signals[index].scoreBreakdown.mapTeamSynergyPoints).toBeCloseTo(signals[index].scoreBreakdown.hybridPoints * rate);
    });
  });
});
