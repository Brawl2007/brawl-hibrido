import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { getSnapshotSynergies, type CounterSyncSnapshotPayload, type SyncedSynergyRelation } from "@shared/counterSyncSnapshot";
import { getBrawlScopeSynergyTeammates, getCounterSourceProfiles, setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import { calculateDraftSignal } from "@shared/draft";
import { defaultDraftRuleSettings } from "@shared/draftRules";
import { parseBrawlScopeModePage } from "./counterSync";
import { brawlScopeSynergyData, BRAWLSCOPE_SYNERGY_LIMIT } from "@shared/brawlScopeSynergyData";
import { brawlScopeModes } from "@shared/brawlScopeModes";

import { setBrawlScopeReading } from "@shared/counterMatchupValue";

beforeEach(() => setBrawlScopeReading("byMode"));

const capturedAt = "2026-09-11T12:00:00.000Z";
const noriUrl = "https://brawlscope.com/counters?brawler=nori";
const noriModeUrl = "https://brawlscope.com/counters/nori?mode=knockout";
const planetUrl = "https://www.brawlplanet.com/brawlers/nori";

const synergies: SyncedSynergyRelation[] = [
  { owner: "Nori", teammate: "Melodie", rank: 1, source: "brawlscope", sourceUrl: noriUrl },
  { owner: "Nori", teammate: "8-Bit", rank: 2, source: "brawlscope", sourceUrl: noriUrl },
  { owner: "Nori", teammate: "Colt", rank: 3, source: "brawlscope", sourceUrl: noriUrl },
  { owner: "Nori", teammate: "Gus", rank: 1, modeId: "knockout", source: "brawlscope", sourceUrl: noriModeUrl },
  { owner: "Nori", teammate: "Poco", rank: 2, modeId: "knockout", source: "brawlscope", sourceUrl: noriModeUrl },
  { owner: "Nori", teammate: "Removido", rank: 4, source: "brawlscope", sourceUrl: noriUrl, pendingRemoval: true },
  { owner: "Nori", teammate: "Pearl", rank: 1, delta: 3.4, source: "planet", sourceUrl: planetUrl },
];

function snapshot(extra: Partial<CounterSyncSnapshotPayload> = {}): CounterSyncSnapshotPayload {
  const state = { status: "success" as const, complete: true, fetchedAt: capturedAt, brawlers: ["Nori"], relationCount: 1 };
  return {
    schemaVersion: 2,
    capturedAt,
    sourceStates: { brawlscope: state, planet: state, prodigy: { ...state, status: "static", complete: false } },
    relations: [
      { owner: "Nori", direction: "targets", attacker: "Nori", defender: "Barley", source: "brawlscope", sourceUrl: noriUrl },
      { owner: "Nori", direction: "targets", attacker: "Nori", defender: "Barley", source: "planet", sourceUrl: planetUrl },
    ],
    synergies,
    absenceStreaks: {},
    ...extra,
  };
}

const nori = { map: "Flaring Phoenix", mode: "Nocaute", modeId: "knockout", brawler: "Nori", tier: "S" as const, score: 72, winRate: 55, usage: 8 };
const gus = { map: "Flaring Phoenix", mode: "Nocaute", modeId: "knockout", brawler: "Gus", tier: "S" as const, score: 70, winRate: 52, usage: 8 };
const pearl = { map: "Flaring Phoenix", mode: "Nocaute", modeId: "knockout", brawler: "Pearl", tier: "S" as const, score: 70, winRate: 52, usage: 8 };
const frank = { map: "Flaring Phoenix", mode: "Nocaute", modeId: "knockout", brawler: "Frank", tier: "S" as const, score: 66, winRate: 50, usage: 8 };

afterEach(() => {
  setBrawlScopeReading("byMode");
  setCounterSyncSnapshot(undefined);
});

describe("leitura da sinergia literal BrawlScope", () => {
  it("lê a secção Pair with da página pública sem completar posições ausentes", () => {
    const html = `
      <h1>Nori counters</h1>
      <p>Counter with</p><ul><li><a href="/counters/doug?mode=knockout">Doug</a></li></ul>
      <p>Punishes</p><ul><li><a href="/counters/mico?mode=knockout">Mico</a></li></ul>
      <p>Pair with</p><ul>
        <li><a href="/counters/melodie?mode=knockout">Melodie</a></li>
        <li><a href="/counters/8-bit?mode=knockout">8-Bit</a></li>
        <li><a href="/counters/melodie?mode=knockout">Melodie</a></li>
        <li><a href="/counters/nori?mode=knockout">Nori</a></li>
      </ul>
    `;
    const parsed = parseBrawlScopeModePage(html, brawlScopeModes.find((mode) => mode.id === "knockout") ?? brawlScopeModes[0], noriModeUrl);

    expect(parsed?.synergies).toEqual([{ brawler: "Melodie" }, { brawler: "8-Bit" }]);
    expect(parsed?.counteredBy).toEqual(["Doug"]);
    expect(parsed?.targets).toEqual(["Mico"]);
  });

  it("preserva a ordem publicada, ignora remoções pendentes e prefere o modo ativo", () => {
    expect(getSnapshotSynergies(snapshot(), "Nori", "brawlscope").map((entry) => entry.teammate)).toEqual([
      "Melodie",
      "8-Bit",
      "Colt",
    ]);
    expect(getSnapshotSynergies(snapshot(), "Nori", "brawlscope", "knockout").map((entry) => entry.teammate)).toEqual(["Gus", "Poco"]);
    /**
     * Um modo que ainda não foi lido recorre à leitura geral, como a própria
     * função promete e como as outras fontes já faziam. A recolha lê uma vista
     * por ciclo: exigir vazio aqui era exigir que a sinergia desaparecesse do
     * Draft enquanto a vista do modo não entrasse.
     */
    expect(getSnapshotSynergies(snapshot(), "Nori", "brawlscope", "gemgrab").map((entry) => entry.teammate)).toEqual([
      "Melodie",
      "8-Bit",
      "Colt",
    ]);
    expect(getSnapshotSynergies(snapshot(), "Nori", "planet").map((entry) => entry.teammate)).toEqual(["Pearl"]);
  });

  it("expõe o Top literal no perfil de fonte BrawlScope", () => {
    setCounterSyncSnapshot(snapshot());
    const profile = getCounterSourceProfiles("Nori").find((entry) => entry.source === "BrawlScope");

    expect(profile?.bestTeammates.map((relation) => relation.brawler)).toEqual(["Melodie", "8-Bit", "Colt"]);
    expect(profile?.bestTeammates.every((relation) => relation.sourceUrl === noriUrl)).toBe(true);
    expect(getBrawlScopeSynergyTeammates("Nori", "knockout").map((relation) => relation.brawler)).toEqual(["Gus", "Poco"]);
  });

  it("não substitui uma lista publicada vazia por valores antigos", () => {
    setCounterSyncSnapshot(snapshot({ synergies: [] }));
    expect(getBrawlScopeSynergyTeammates("Nori")).toEqual([]);
    expect(getBrawlScopeSynergyTeammates("Nori", "knockout")).toEqual([]);
  });

  it("continua a preferir a lista live quando ela existe", () => {
    setCounterSyncSnapshot(snapshot());

    expect(getBrawlScopeSynergyTeammates("Nori").map((relation) => relation.brawler)).toEqual(["Melodie", "8-Bit", "Colt"]);
  });

  it("mantém o perfil de uma fonte que publicou apenas sinergia e não cria perfis estáticos", () => {
    setCounterSyncSnapshot(snapshot({
      relations: [],
      synergies: [{ owner: "Nori", teammate: "Gus", rank: 1, source: "brawlscope", sourceUrl: noriUrl }],
    }));

    expect(getCounterSourceProfiles("Nori").map((profile) => profile.source)).toEqual(["BrawlScope"]);
    expect(getCounterSourceProfiles("Nori")[0]).toMatchObject({ targets: [], counteredBy: [] });
  });
});

/** As regras de antes da v168 (equipa tripla ligada, qualquer par conta), para os testes que medem esses mecanismos. */
const REGRAS_ANTES_DA_V168 = { sinergiaDeEquipaTripla: 1, sinergiaSoAcimaDaVitoria: 0, counterMinimo: 0.5 };

describe("bónus de sinergia BrawlScope no Draft", () => {
  it("v168 (opção) · a dupla só conta quando o par ganha mais do que ele sozinho (percentagem publicada positiva)", () => {
    const SO_ACIMA = { sinergiaSoAcimaDaVitoria: 1 };
    setBrawlScopeReading("overall");
    for (const [delta, conta] of [[4.4, true], [0, false], [-3.2, false]] as const) {
      setCounterSyncSnapshot(snapshot({ synergies: [{ owner: "Nori", teammate: "Gus", delta, rank: 1, source: "brawlscope", sourceUrl: noriUrl }] }));
      const signal = calculateDraftSignal(nori, { mapModeId: "knockout", pickNumber: 2, allyRows: [gus], ruleSettings: SO_ACIMA });
      expect(signal.scoreBreakdown.synergyPoints > 0).toBe(conta);
      if (!conta) expect(signal.scoreBreakdown.synergyPoints).toBe(0);
    }
    // Sem percentagem publicada não se sabe se o par ganha mais: não conta.
    setCounterSyncSnapshot(snapshot());
    const semNumero = calculateDraftSignal(nori, { mapModeId: "knockout", pickNumber: 2, allyRows: [gus], ruleSettings: SO_ACIMA });
    expect(semNumero.scoreBreakdown.synergyPoints).toBe(0);
    expect(semNumero.bonusSources.synergyAllies).toEqual([]);
  });

  it("usa a percentagem publicada pela fonte como bónus", () => {
    setBrawlScopeReading("overall");
    setCounterSyncSnapshot(snapshot({
      synergies: [{ owner: "Nori", teammate: "Gus", delta: 11.6, rank: 1, source: "brawlscope", sourceUrl: noriUrl }],
    }));
    const signal = calculateDraftSignal(nori, { mapModeId: "knockout", pickNumber: 2, allyRows: [gus] });

    expect(signal.scoreBreakdown.hasPublishedSynergyRate).toBe(true);
    expect(signal.scoreBreakdown.synergyBonusRate).toBeCloseTo(0.116, 6);
    expect(signal.scoreBreakdown.synergyPoints).toBeCloseTo(signal.scoreBreakdown.hybridPoints * 0.116, 6);
    expect(signal.reasons.join(" ")).toContain("Gus +11.6%");
  });

  it("soma as percentagens publicadas de cada aliado já escolhido", () => {
    setBrawlScopeReading("overall");
    setCounterSyncSnapshot(snapshot({
      synergies: [
        { owner: "Nori", teammate: "Gus", delta: 11.6, rank: 1, source: "brawlscope", sourceUrl: noriUrl },
        { owner: "Nori", teammate: "Pearl", delta: 4.4, rank: 2, source: "brawlscope", sourceUrl: noriUrl },
      ],
    }));
    const signal = calculateDraftSignal(nori, { mapModeId: "knockout", pickNumber: 2, allyRows: [gus, pearl] });

    expect(signal.scoreBreakdown.synergyBonusRate).toBeCloseTo(0.16, 6);
  });

  it("atualiza perfil e Draft por vista e preserva zero publicado", () => {
    const publish = (delta: number) => setCounterSyncSnapshot(snapshot({
      synergies: [
        { owner: "Nori", teammate: "Gus", delta: 9, rank: 1, source: "brawlscope", sourceUrl: noriUrl },
        { owner: "Nori", teammate: "Gus", delta, rank: 1, modeId: "knockout", source: "brawlscope", sourceUrl: noriModeUrl },
      ],
    }));
    for (const delta of [6.1, 2.4, 0]) {
      publish(delta);
      expect(getBrawlScopeSynergyTeammates("Nori", "knockout")[0].delta).toBe(delta);
      const signal = calculateDraftSignal(nori, { mapModeId: "knockout", pickNumber: 2, allyRows: [gus], ruleSettings: REGRAS_ANTES_DA_V168 });
      expect(signal.scoreBreakdown.hasPublishedSynergyRate).toBe(true);
      expect(signal.scoreBreakdown.synergyBonusRate).toBeCloseTo(delta / 100);
      expect(getBrawlScopeSynergyTeammates("Nori")[0].delta).toBe(9);
      // Sem lista própria, o modo mostra a leitura geral — que aqui é o 9 do topo.
      expect(getBrawlScopeSynergyTeammates("Nori", "heist")[0].delta).toBe(9);
    }
    setBrawlScopeReading("overall");
    expect(calculateDraftSignal(nori, { mapModeId: "knockout", pickNumber: 2, allyRows: [gus], ruleSettings: REGRAS_ANTES_DA_V168 }).scoreBreakdown.synergyBonusRate).toBeCloseTo(0.09);
  });

  it("aplica a taxa configurada do pick quando a fonte não publica percentagem", () => {
    setCounterSyncSnapshot(snapshot());
    const signal = calculateDraftSignal(nori, { mapModeId: "knockout", pickNumber: 2, allyRows: [gus], ruleSettings: REGRAS_ANTES_DA_V168 });

    expect(signal.scoreBreakdown.synergyPoints).toBeCloseTo(signal.scoreBreakdown.hybridPoints * defaultDraftRuleSettings.synergyPick2);
    expect(signal.bonusSources.synergySource).toBe("BrawlScope");
    expect(signal.bonusSources.brawlScopeSynergyAllies).toEqual(["Gus"]);
    expect(signal.bonusSources.brawlScopeSynergyTop).toEqual(["Gus", "Poco"]);
    expect(signal.reasons.join(" ")).toContain("Bónus Sinergia BrawlScope");
    expect(signal.reasons.join(" ")).toContain(noriModeUrl);
  });

  it("não inventa sinergia para um aliado fora da lista publicada", () => {
    setCounterSyncSnapshot(snapshot());
    const signal = calculateDraftSignal(nori, { mapModeId: "knockout", pickNumber: 2, allyRows: [frank] });

    expect(signal.scoreBreakdown.synergyPoints).toBe(0);
    expect(signal.bonusSources.synergySource).toBeUndefined();
    expect(signal.bonusSources.synergyAllies).toEqual([]);
  });

  it("recorre ao Best Teammate do Brawl Planet apenas quando o BrawlScope é silencioso", () => {
    setCounterSyncSnapshot(snapshot({ synergies: synergies.filter((entry) => entry.source === "planet") }));
    const signal = calculateDraftSignal(nori, { mapModeId: "knockout", pickNumber: 2, allyRows: [pearl] });

    expect(signal.bonusSources.synergySource).toBe("Brawl Planet");
    expect(signal.bonusSources.brawlScopeSynergyAllies).toEqual([]);
    expect(signal.scoreBreakdown.synergyPoints).toBeGreaterThan(0);
  });

  /**
   * A composição do mapa acumula com a sinergia, em vez de a substituir.
   *
   * A regra era o contrário, e deliberada: a composição, por medir o trio
   * naquele mapa, contava sozinha para não haver "bónus duplicado". Foi
   * invertida por decisão de quem usa o site, pela mesma razão já aplicada
   * entre as duas fontes — são medições diferentes da mesma escolha, e uma não
   * anula a outra.
   *
   * O caso que o mostrou: no Beach Ball, a ficha do Shade publica "El Primo
   * +5,0%" e o Brawl Planet publica o trio "El Primo · Gus · Shade". O valor
   * da dupla existe e não entrava no Score.
   */
  it("acumula a composição do mapa com a sinergia publicada", () => {
    setCounterSyncSnapshot(snapshot());
    const mapTeams = [
      { map: "Flaring Phoenix", brawlers: ["Nori", "Gus", "Pearl"], winRate: 58.1, sourceUrl: "https://www.brawlplanet.com/maps/flaring-phoenix" },
    ];
    const signal = calculateDraftSignal(nori, { mapModeId: "knockout", pickNumber: 2, allyRows: [gus], mapTeams, mapName: "Flaring Phoenix", ruleSettings: REGRAS_ANTES_DA_V168 });

    expect(signal.scoreBreakdown.mapTeamSynergyPoints).toBeGreaterThan(0);
    expect(signal.scoreBreakdown.synergyPoints).toBeGreaterThan(0);
    expect(signal.bonusSources.mapTeamBoard?.map((team) => team.rank)).toEqual([1]);
  });
});

describe("catálogo estático recolhido da fonte", () => {
  it("traz as dez sinergias publicadas de cada perfil legível", () => {
    const perfis = Object.values(brawlScopeSynergyData);

    expect(perfis).toHaveLength(105);
    expect(perfis.flatMap((entry) => entry.teammates)).toHaveLength(1050);
    for (const entry of perfis) {
      expect(entry.teammates.length).toBeLessThanOrEqual(BRAWLSCOPE_SYNERGY_LIMIT);
      expect(entry.teammates.every((teammate) => typeof teammate.delta === "number" && teammate.delta > 0)).toBe(true);
      expect(entry.teammates.some((teammate) => teammate.brawler === entry.brawler)).toBe(false);
      expect(entry.sourceUrl).toMatch(/^https:\/\/brawlscope\.com\/counters\//);
    }
  });

  it("preserva os valores lidos na ficha, incluindo o par Amber–Shade", () => {
    expect(brawlScopeSynergyData.amber.teammates[0]).toEqual({ brawler: "Shade", delta: 11.5 });
    expect(brawlScopeSynergyData.nori.teammates[0]).toEqual({ brawler: "Melodie", delta: 14.3 });
  });

  it("deixa a Wendy de fora, porque a fonte não publica nada sobre ela", () => {
    expect(brawlScopeSynergyData.wendy).toBeUndefined();
  });
});
