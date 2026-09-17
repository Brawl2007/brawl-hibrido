import { getCounterProfile } from "../shared/draft";
import { buildBrawlerCatalog, normalizeBrawlerCatalogName } from "../shared/brawlerCatalog";
import type { CounterSyncSnapshotPayload } from "../shared/counterSyncSnapshot";
import { describe, expect, it } from "vitest";
import { afterEach } from "vitest";
import {
  getBrawlCalculatorTips,
  getBrawlCalculatorTipsForBrawler,
  getResolvedCounterDirection,
  getCounterSourceProfiles,
  getPLProdigyCounterDirection,
  getPLProdigyCounterProfile,
  getPLProdigyLiteralCounterRelations,
  resolveCounterDirectionFromProfiles,
  setCounterSyncSnapshot,
  type CounterSourceProfile,
} from "@shared/counterSourceRelations";
import { getBrawlCalculatorTipTranslation } from "@shared/brawlCalculatorTipTranslations";
import { brawlScopeCounterData } from "@shared/brawlScopeCounterData";
import { getBrawlScopeCoverage } from "@shared/counterMatchupValue";
import { plProdigyCounterData } from "@shared/plProdigyCounterData";
import { allRankedRows } from "../client/src/data/rankedData";

function profile(
  source: CounterSourceProfile["source"],
  targets: string[] = [],
  counteredBy: string[] = [],
): CounterSourceProfile {
  return {
    source,
    sourceUrl: `https://example.com/${source.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    targets: targets.map((brawler) => ({ brawler, source, sourceUrl: "https://example.com" })),
    counteredBy: counteredBy.map((brawler) => ({ brawler, source, sourceUrl: "https://example.com" })),
    bestTeammates: [],
    worstTeammates: [],
  };
}

describe("counter source relations", () => {
  afterEach(() => {
    setCounterSyncSnapshot(undefined, { allowOfflineFallback: true });
  });

  // O Brawl Calculator saiu da lista: as relações dele já não produzem perfis, por
  // isso um brawler exclusivo dessa fonte não pode ser materializado a partir
  // dela. As fontes que ainda publicam direção são Brawl Planet e PL Prodigy.
  it.each(["planet", "prodigy"] as const)("keeps %s-only brawlers in general and mode profiles and partial catalog", (source) => {
    const state = { status: "success" as const, complete: true, fetchedAt: "2026-09-09T00:00:00Z", brawlers: [], relationCount: 0 };
    const snapshot: CounterSyncSnapshotPayload = {
      schemaVersion: 2, capturedAt: state.fetchedAt, activeBrawlers: ["Bolt", "Ash", "Fang"], absenceStreaks: {},
      sourceStates: {
        brawlscope: { ...state, brawlers: ["Bolt", "Ash", "Fang", "8-Bit", "R-T", "Mr. P", "Larry & Lawrie"] },
        calculator: state, planet: state, prodigy: state,
        [source]: { ...state, brawlers: ["Source Only", "Glowy", "Pending", "8bit", "RT", "Mr P", "Larry"] },
      },
      relations: [
        { owner: "Bolt", direction: "targets", attacker: "Bolt", defender: "Source Only", source, sourceUrl: "https://source.test/bolt" },
        { owner: "Source Only", direction: "counteredBy", attacker: "Bolt", defender: "Source Only", source, sourceUrl: "https://source.test/only" },
        { owner: "Bolt", direction: "targets", attacker: "Bolt", defender: "Ash", source: "brawlscope", modeId: "brawlBall", sourceUrl: "https://scope.test/ball" },
        { owner: "Bolt", direction: "targets", attacker: "Bolt", defender: "Fang", source: "brawlscope", modeId: "hotZone", sourceUrl: "https://scope.test/zone" },
        { owner: "Bolt", direction: "counteredBy", attacker: "Glowy", defender: "Bolt", source, sourceUrl: "https://source.test/bolt" },
        { owner: "Bolt", direction: "targets", attacker: "Bolt", defender: "Pending", source, pendingRemoval: true, sourceUrl: "https://source.test/bolt" },
      ],
    };
    setCounterSyncSnapshot(snapshot);
    const general = getCounterSourceProfiles("Bolt", "global");
    const alvosGerais = general.flatMap(p => p.targets.map(r => r.brawler));
    /**
     * A Geral lê a Geral, e mais nada.
     *
     * `Source Only` vem de uma relação sem modo, e por isso pertence aqui. `Ash`
     * e `Fang` são leituras do BrawlScope em Fute-Brawl e Zona Estratégica: cada
     * uma vale no seu modo e nenhuma foi publicada como geral.
     *
     * Juntá-las aqui seria inventar uma leitura geral a partir da união dos
     * modos — e o BrawlScope publica a sua própria vista Overall, que é uma
     * leitura distinta e não essa soma. Um brawler pode ganhar no geral e perder
     * num modo. Enquanto a Overall não for lida, a resposta certa é não ter nada
     * a dizer.
     */
    expect(alvosGerais).toContain("Source Only");
    expect(alvosGerais).not.toContain("Ash");
    expect(alvosGerais).not.toContain("Fang");
    for (const [mode, included, excluded] of [["brawl-ball", "Ash", "Fang"], ["hotZone", "Fang", "Ash"]]) {
      const profiles = getCounterSourceProfiles("Bolt", mode);
      const targets = profiles.flatMap(p => p.targets.map(r => r.brawler));
      expect(targets).toEqual(expect.arrayContaining(["Source Only", included]));
      expect(targets).not.toContain(excluded);
      expect(targets).not.toContain("Pending");
      expect(profiles.flatMap(p => p.counteredBy)).toEqual([]);
      expect(profiles.find(p => p.source !== "BrawlScope")?.modeId).toBeUndefined();
    }
    expect(getCounterProfile("source_only").counteredBy).toEqual(["Bolt"]);
    // A Ranked candidate list must not hide a published external target either.
    expect(getCounterProfile("Bolt", ["Bolt", "Ash", "Fang", "Shelly", "Colt", "Brock", "Nita", "Rosa"]).counters).toContain("Source Only");
    const rows = ["8bit", "RT", "Mr P", "Larry"].map(brawler => ({ brawler, score: 75, tier: "A" as const, map: "Test", mode: "Test", modeId: "heist" }));
    const catalog = buildBrawlerCatalog(rows, snapshot);
    expect(catalog.find(b => b.brawler === "Source Only")).toMatchObject({
      isRankedAvailable: false, brawlerId: null, build: null, winRate: null, usageRate: null,
      bestRow: { score: 0, rankedStatus: "unavailable", map: "", mode: "" },
      profile: { counteredBy: ["Bolt"] },
    });
    expect(catalog.filter(b => b.isRankedAvailable).map(b => b.brawler).sort()).toEqual(["8-Bit", "Larry & Lawrie", "Mr. P", "R-T"]);
    expect(new Set(catalog.map(b => normalizeBrawlerCatalogName(b.brawler))).size).toBe(catalog.length);
    expect(snapshot.relations[0].modeId).toBeUndefined();
  });

  it("uses a synchronized snapshot for the shared Draft and Brawlers resolver", () => {
    setCounterSyncSnapshot({
      schemaVersion: 2,
      capturedAt: "2026-08-24T16:00:00.000Z",
      sourceStates: {
        brawlscope: { status: "static", complete: false, fetchedAt: "2026-08-24T16:00:00.000Z", brawlers: ["Bolt"], relationCount: 0 },
        prodigy: { status: "static", complete: false, fetchedAt: "2026-08-24T16:00:00.000Z", brawlers: ["Bolt"], relationCount: 0 },
        calculator: { status: "success", complete: true, fetchedAt: "2026-08-24T16:00:00.000Z", brawlers: ["Bolt", "Ash"], relationCount: 1 },
        planet: { status: "success", complete: true, fetchedAt: "2026-08-24T16:00:00.000Z", brawlers: ["Bolt"], relationCount: 0 },
      },
      absenceStreaks: {},
      relations: [
        {
          owner: "Bolt",
          direction: "targets",
          attacker: "Bolt",
          defender: "Ash",
          source: "planet",
          sourceUrl: "https://www.brawlplanet.com/brawlers/bolt",
        },
        // O Brawl Calculator deixou de ser fonte de direção de counter: entra na
        // mesma sincronização, mas o resolver ignora-o e ele só sobrevive como
        // dica tática. Sem isto o mesmo par contava por duas fontes.
        {
          owner: "Bolt",
          direction: "counteredBy",
          attacker: "Ash",
          defender: "Bolt",
          source: "calculator",
          sourceUrl: "https://brawlcalculator.com/counters/bolt/",
        },
      ],
    });

    const profiles = getCounterSourceProfiles("Bolt");
    expect(profiles.map(profile => profile.source)).toContain("Brawl Planet");
    expect(profiles.map(profile => profile.source)).not.toContain("Brawl Calculator");
    expect(profiles.find(profile => profile.source === "Brawl Planet")?.targets.map((relation) => relation.brawler)).toEqual(["Ash"]);
    expect(getResolvedCounterDirection("Bolt", "Ash")).toMatchObject({ direction: "targets", source: "Brawl Planet" });
  });

  it("keeps the brawler profile available but hides offline counters before the first live snapshot", () => {
    setCounterSyncSnapshot(undefined, { allowOfflineFallback: false });
    expect(getCounterSourceProfiles("Brock")).toEqual([]);
  });

  it("uses only the literal list published on the brawler page, not every matching pair in the source snapshot", () => {
    setCounterSyncSnapshot({
      schemaVersion: 2,
      capturedAt: "2026-08-24T16:00:00.000Z",
      sourceStates: {
        brawlscope: { status: "static", complete: false, fetchedAt: "2026-08-24T16:00:00.000Z", brawlers: ["Bolt", "Ash"], relationCount: 0 },
        prodigy: { status: "static", complete: false, fetchedAt: "2026-08-24T16:00:00.000Z", brawlers: ["Bolt", "Ash"], relationCount: 0 },
        calculator: { status: "success", complete: true, fetchedAt: "2026-08-24T16:00:00.000Z", brawlers: ["Bolt", "Ash"], relationCount: 2 },
        planet: { status: "success", complete: true, fetchedAt: "2026-08-24T16:00:00.000Z", brawlers: ["Bolt", "Ash"], relationCount: 0 },
      },
      absenceStreaks: {},
      // A fonte passou a ser o Brawl Planet: o Brawl Calculator já não produz
      // perfis de counter, mas a regra auditada aqui — cada página só contribui
      // com a sua própria lista — continua a ser a mesma.
      relations: [
        { owner: "Bolt", direction: "targets", attacker: "Bolt", defender: "Ash", source: "planet", sourceUrl: "https://www.brawlplanet.com/brawlers/bolt" },
        { owner: "Ash", direction: "counteredBy", attacker: "Bolt", defender: "Ash", source: "planet", sourceUrl: "https://www.brawlplanet.com/brawlers/ash" },
      ],
    });

    const bolt = getCounterSourceProfiles("Bolt").find(profile => profile.source === "Brawl Planet");
    const ash = getCounterSourceProfiles("Ash").find(profile => profile.source === "Brawl Planet");
    expect(bolt?.targets.map(relation => relation.brawler)).toEqual(["Ash"]);
    expect(bolt?.counteredBy).toEqual([]);
    expect(ash?.targets).toEqual([]);
    expect(ash?.counteredBy.map(relation => relation.brawler)).toEqual(["Bolt"]);
  });

  it("separates BrawlScope by mode and hides targets outside the active snapshot roster", () => {
    setCounterSyncSnapshot({
      schemaVersion: 2,
      capturedAt: "2026-09-07T00:00:00.000Z",
      activeBrawlers: ["Bolt", "Ash"],
      sourceStates: {
        brawlscope: { status: "success", complete: true, fetchedAt: "2026-09-07T00:00:00.000Z", brawlers: ["Bolt", "Ash"], relationCount: 2, modes: ["brawlBall", "hotZone"] },
        prodigy: { status: "static", complete: false, fetchedAt: "2026-09-07T00:00:00.000Z", brawlers: [], relationCount: 0 },
        calculator: { status: "success", complete: true, fetchedAt: "2026-09-07T00:00:00.000Z", brawlers: [], relationCount: 0 },
        planet: { status: "success", complete: true, fetchedAt: "2026-09-07T00:00:00.000Z", brawlers: [], relationCount: 0 },
      },
      absenceStreaks: {},
      relations: [
        { owner: "Bolt", direction: "targets", attacker: "Bolt", defender: "Ash", source: "brawlscope", sourceUrl: "https://brawlscope.com/counters/bolt?mode=brawlBall", modeId: "brawlBall", mode: "Fute-Brawl" },
        { owner: "Bolt", direction: "targets", attacker: "Bolt", defender: "Old Brawler", source: "brawlscope", sourceUrl: "https://brawlscope.com/counters/bolt?mode=hotZone", modeId: "hotZone", mode: "Zona Estratégica" },
      ],
      // A sinergia da mesma página, no mesmo modo. Tem de vir na snapshot: com
      // uma snapshot ativa o catálogo estático não é consultado, e para um modo
      // nunca é — ele é a vista Overall, e usá-lo aqui seria dar por lida uma
      // leitura de modo que a fonte não publicou.
      synergies: [
        { owner: "Bolt", teammate: "Ash", source: "brawlscope", sourceUrl: "https://brawlscope.com/counters/bolt?mode=hotZone", rank: 1, modeId: "hotZone", mode: "Zona Estratégica" },
      ],
    });

    expect(getCounterSourceProfiles("Bolt", "brawlBall").find((profile) => profile.source === "BrawlScope")?.targets.map((relation) => relation.brawler)).toEqual(["Ash"]);
    // O perfil BrawlScope sobrevive quando a mesma página publica sinergia, mesmo
    // sem nenhum counter válido no modo: counters e "Pair with" são duas leituras
    // independentes e a ausência de uma não pode apagar a outra. O que não pode
    // aparecer é o alvo fora do roster ativo.
    const hotZone = getCounterSourceProfiles("Bolt", "hotZone").find((profile) => profile.source === "BrawlScope");
    expect(hotZone?.targets).toEqual([]);
    expect(hotZone?.counteredBy).toEqual([]);
    expect(hotZone?.bestTeammates.length).toBeGreaterThan(0);
    /**
     * Nenhuma das duas relações foi publicada como geral, por isso na vista
     * geral o BrawlScope não tem counters nenhuns — a de Fute-Brawl vale em
     * Fute-Brawl.
     *
     * O perfil existe à mesma, porque a mesma página publica uma lista "Pair
     * with" e as duas leituras são independentes. O que aqui se verifica é que
     * nenhuma relação de modo passou para a vista geral.
     */
    const geral = getCounterSourceProfiles("Bolt").find((profile) => profile.source === "BrawlScope");
    expect(geral?.targets).toEqual([]);
    expect(geral?.counteredBy).toEqual([]);
  });

  it("combines current global counters with the selected BrawlScope mode and ignores pending removals", () => {
    setCounterSyncSnapshot({
      schemaVersion: 2,
      capturedAt: "2026-09-07T00:00:00.000Z",
      activeBrawlers: ["Bolt", "Ash", "Fang", "Shelly"],
      sourceStates: {
        brawlscope: { status: "success", complete: true, fetchedAt: "2026-09-07T00:00:00.000Z", brawlers: ["Bolt", "Ash", "Fang", "Shelly"], relationCount: 3, modes: ["brawlBall", "hotZone"] },
        prodigy: { status: "static", complete: false, fetchedAt: "2026-09-07T00:00:00.000Z", brawlers: [], relationCount: 0 },
        calculator: { status: "success", complete: true, fetchedAt: "2026-09-07T00:00:00.000Z", brawlers: [], relationCount: 0 },
        planet: { status: "success", complete: true, fetchedAt: "2026-09-07T00:00:00.000Z", brawlers: [], relationCount: 0 },
      },
      absenceStreaks: {},
      relations: [
        // Counter global de uma fonte autorizada; o Brawl Calculator já não
        // conta como fonte de direção, por isso o global vem do Brawl Planet.
        { owner: "Bolt", direction: "targets", attacker: "Bolt", defender: "Ash", source: "planet", sourceUrl: "https://planet.test/bolt" },
        { owner: "Bolt", direction: "targets", attacker: "Bolt", defender: "Fang", source: "brawlscope", sourceUrl: "https://brawlscope.test/bolt?mode=brawlBall", modeId: "brawlBall" },
        { owner: "Bolt", direction: "targets", attacker: "Bolt", defender: "Shelly", source: "brawlscope", sourceUrl: "https://brawlscope.test/bolt?mode=hotZone", modeId: "hotZone", pendingRemoval: true },
      ],
    });

    const brawlBallTargets = getCounterSourceProfiles("Bolt", "brawl-ball").flatMap((profile) => profile.targets.map((relation) => relation.brawler));
    const generalTargets = getCounterSourceProfiles("Bolt").flatMap((profile) => profile.targets.map((relation) => relation.brawler));
    expect(brawlBallTargets).toEqual(expect.arrayContaining(["Ash", "Fang"]));
    expect(brawlBallTargets).not.toContain("Shelly");
    // `Ash` é a relação global do Brawl Planet e fica. `Fang` é do BrawlScope em
    // Fute-Brawl: aparece na vista desse modo, acima, e não na geral.
    expect(generalTargets).toContain("Ash");
    expect(generalTargets).not.toContain("Fang");
    expect(generalTargets).not.toContain("Shelly");
  });

  // O Brawl Calculator saiu da resolução de counters — passou a valer apenas como
  // dica tática — para o mesmo confronto não ser contado por duas fontes. As três
  // fontes com direção auditável continuam a ser expostas pelo nome do brawler.
  it("resolves BrawlScope, Brawl Planet and PL Prodigy profiles using a brawler name", () => {
    const profiles = getCounterSourceProfiles("Brock");

    expect(profiles.map((profile) => profile.source)).toEqual(
      expect.arrayContaining(["BrawlScope", "Brawl Planet", "PL Prodigy"]),
    );
    expect(profiles.map((profile) => profile.source)).not.toContain("Brawl Calculator");
    expect(profiles.every((profile) => profile.sourceUrl.startsWith("https://"))).toBe(true);
    // Continua disponível como texto tático para o mesmo brawler.
    expect(getBrawlCalculatorTipsForBrawler("Brock").length).toBeGreaterThan(0);
  });

  it("preserves the literal PL Prodigy columns as a separately identified source", () => {
    const prodigy = plProdigyCounterData.Brock;
    const profile = getCounterSourceProfiles("Brock").find(item => item.source === "PL Prodigy");

    expect(profile?.sourceUrl).toBe(prodigy.sourceUrl);
    expect(profile?.targets.map(relation => relation.brawler)).toEqual(prodigy.targets);
    expect(profile?.counteredBy.map(relation => relation.brawler)).toEqual(prodigy.counteredBy);
  });

  it("mantém para o Draft exclusivamente as oito relações PL Prodigy de cada direção", () => {
    for (const source of Object.values(plProdigyCounterData)) {
      const profile = getPLProdigyCounterProfile(source.brawler);
      expect(profile?.source).toBe("PL Prodigy");
      expect(profile?.sourceUrl).toBe(source.sourceUrl);
      expect(profile?.targets.map(relation => relation.brawler)).toEqual(source.targets);
      expect(profile?.counteredBy.map(relation => relation.brawler)).toEqual(source.counteredBy);
      expect(profile?.targets).toHaveLength(8);
      expect(profile?.counteredBy).toHaveLength(8);
      expect(getPLProdigyCounterDirection(source.brawler, source.targets[0]!)).toBe("targets");
      expect(getPLProdigyCounterDirection(source.brawler, source.counteredBy[0]!)).toBe("counteredBy");
      expect(getPLProdigyLiteralCounterRelations(source.brawler, source.targets[0]!)).toEqual([
        expect.objectContaining({ brawler: source.targets[0], source: "PL Prodigy", sourceUrl: source.sourceUrl }),
      ]);
      expect(getPLProdigyLiteralCounterRelations(source.brawler, source.counteredBy[0]!)).toEqual([]);
    }
  });

  it("preserves every currently published BrawlScope relation in its literal order", () => {
    const profiles = getCounterSourceProfiles("Brock");
    const brawlScope = profiles.find((profile) => profile.source === "BrawlScope");

    expect(brawlScope?.targets.map((relation) => relation.brawler)).toEqual(brawlScopeCounterData.brock.targets);
    expect(brawlScope?.counteredBy.map((relation) => relation.brawler)).toEqual(brawlScopeCounterData.brock.counteredBy);
    expect(brawlScope?.targets.length).toBeGreaterThan(0);
    expect(brawlScope?.counteredBy.length).toBeGreaterThan(0);
  });

  it("expõe o perfil de Ruffs sem qualquer troca de listas", () => {
    const ruffs = brawlScopeCounterData.ruffs;
    const profile = getCounterSourceProfiles("Ruffs").find((item) => item.source === "BrawlScope");

    expect(profile?.targets.map((relation) => relation.brawler)).toEqual(ruffs?.targets);
    expect(profile?.counteredBy.map((relation) => relation.brawler)).toEqual(ruffs?.counteredBy);
    expect(getResolvedCounterDirection("Ruffs", ruffs.targets[0])).toMatchObject({
      direction: "targets",
      source: "BrawlScope",
    });
  });

  it("preserves the raw BrawlScope catalogue for every profile, with no exception", () => {
    const keyOf = (brawler: string) => brawler.toLowerCase().replace(/[^a-z0-9]/g, "");
    const entries = Object.entries(brawlScopeCounterData).map(([brawler, relations]) => ({
      brawler,
      ...relations,
    }));

    for (const owner of entries) {
      const profile = getCounterSourceProfiles(owner.brawler).find((item) => item.source === "BrawlScope");
      const expectedTargets = [...owner.targets];
      const expectedCounteredBy = [...owner.counteredBy];

      expect(profile?.targets.map((relation) => relation.brawler), `${owner.brawler} targets`).toEqual(expectedTargets);
      expect(profile?.counteredBy.map((relation) => relation.brawler), `${owner.brawler} counteredBy`).toEqual(expectedCounteredBy);
    }
  });

  it("exposes all literal Best and Worst Teammates from Brawl Planet", () => {
    const planet = getCounterSourceProfiles("8-Bit").find((profile) => profile.source === "Brawl Planet");

    expect(planet?.bestTeammates).toHaveLength(5);
    expect(planet?.worstTeammates).toHaveLength(5);
    expect(planet?.worstTeammates[0]).toMatchObject({ brawler: "Charlie", delta: -4.9, source: "Brawl Planet" });
  });

  // A fonte passou a publicar a tabela completa da Wendy. O estado que interessa
  // distinguir deixou de ser "sem perfil" e passou a ser "perfil publicado sem
  // nenhum adversário com vantagem" — o caso dos brawlers dominantes do momento.
  it("keeps the Wendy BrawlScope profile with no counters when the source publishes none", () => {
    const profiles = getCounterSourceProfiles("Wendy");
    const planet = profiles.find((profile) => profile.source === "Brawl Planet");
    const brawlScope = profiles.find((profile) => profile.source === "BrawlScope");

    expect(planet?.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ brawler: "Nani", delta: 3.9, source: "Brawl Planet" }),
    ]));
    expect(planet?.counteredBy).toEqual(expect.arrayContaining([
      expect.objectContaining({ brawler: "Trunk", delta: -14.4, source: "Brawl Planet" }),
    ]));
    expect(planet?.bestTeammates).toEqual(expect.arrayContaining([
      expect.objectContaining({ brawler: "Trunk", delta: 4.3, source: "Brawl Planet" }),
    ]));
    expect(planet?.worstTeammates).toEqual(expect.arrayContaining([
      expect.objectContaining({ brawler: "Mortis", delta: -13.5, source: "Brawl Planet" }),
    ]));
    const coverage = getBrawlScopeCoverage("Wendy");
    expect(coverage.published).toBe(true);
    expect(coverage.counters).toBe(0);
    expect(coverage.targets).toBeGreaterThan(0);
    expect(brawlScope?.counteredBy).toEqual([]);
    expect(brawlScope?.targets.map((relation) => relation.brawler)).toEqual(brawlScopeCounterData.wendy.targets);
  });

  it("exposes every literal BrawlScope relation currently published for Nori", () => {
    const nori = getCounterSourceProfiles("Nori").find((profile) => profile.source === "BrawlScope");

    // As listas vêm do catálogo atual: o que se audita é que o perfil expõe
    // exatamente o que a fonte publica, nos dois sentidos e na ordem publicada,
    // sem reordenar nem cortar. Fixar os nomes tornava o teste vermelho a cada
    // reimportação sem nada estar partido.
    const published = brawlScopeCounterData.nori;
    expect(published.targets.length).toBeGreaterThan(0);
    expect(published.counteredBy.length).toBeGreaterThan(0);
    expect(nori?.targets.map((relation) => relation.brawler)).toEqual(published.targets);
    expect(nori?.counteredBy.map((relation) => relation.brawler)).toEqual(published.counteredBy);
    expect(nori?.targets.every((relation) => relation.source === "BrawlScope")).toBe(true);
  });

  // A Nita já publica as duas listas completas, por isso o perfil incompleto é
  // procurado no catálogo: o que continua a ter de valer é que uma lista curta
  // não é preenchida até dez com nomes inventados.
  it("exposes the literal published lists in both directions without filling missing Top 10 slots", () => {
    const [slug, published] = Object.entries(brawlScopeCounterData)
      .find(([, relations]) => relations.targets.length > 0
        && relations.counteredBy.length > 0
        && (relations.targets.length < 10 || relations.counteredBy.length < 10))!;
    const profile = getCounterSourceProfiles(slug).find((item) => item.source === "BrawlScope");

    expect(published).toBeDefined();
    expect(Math.min(published.targets.length, published.counteredBy.length)).toBeLessThan(10);
    expect(profile?.targets.map((relation) => relation.brawler)).toEqual(published.targets);
    expect(profile?.counteredBy.map((relation) => relation.brawler)).toEqual(published.counteredBy);
  });

  it("keeps both literal BrawlScope directions with every published item up to the Top 10 limit", () => {
    // Quem publica só um dos sentidos sai do catálogo, não de uma lista fixa de
    // slugs: um brawler dominante simplesmente não tem counters listados, e essa
    // condição muda a cada reimportação.
    const entries = Object.entries(brawlScopeCounterData);
    const oneDirectionOnly = entries.filter(([, relations]) => !relations.targets.length || !relations.counteredBy.length);
    const oneDirectionSlugs = new Set(oneDirectionOnly.map(([slug]) => slug));
    const completeProfiles = entries.filter(([slug]) => !oneDirectionSlugs.has(slug));

    expect(entries.length).toBeGreaterThan(90);
    // O caso de um só sentido tem de continuar a ser a exceção, não a regra.
    expect(oneDirectionOnly.length).toBeLessThan(entries.length / 10);
    expect(completeProfiles).toHaveLength(entries.length - oneDirectionOnly.length);
    for (const [, relations] of oneDirectionOnly) {
      expect(relations.targets.length + relations.counteredBy.length).toBeGreaterThan(0);
      expect(relations.targets.length).toBeLessThanOrEqual(10);
      expect(relations.counteredBy.length).toBeLessThanOrEqual(10);
    }
    for (const [, relations] of completeProfiles) {
      expect(relations.counteredBy.length).toBeGreaterThan(0);
      expect(relations.counteredBy.length).toBeLessThanOrEqual(10);
      expect(relations.targets.length).toBeGreaterThan(0);
      expect(relations.targets.length).toBeLessThanOrEqual(10);
      // Set não tem `length`: a asserção original nunca chegava a comparar nada.
      expect(new Set(relations.counteredBy).size).toBe(relations.counteredBy.length);
      expect(new Set(relations.targets).size).toBe(relations.targets.length);
    }
  });

  it("keeps Brawl Calculator tips bound to the requested attacker and defender direction", () => {
    const tips = getBrawlCalculatorTips("Max", "Brock");

    expect(tips.length).toBeGreaterThan(0);
    expect(tips.every((tip) => tip.attacker === "Max" && tip.defender === "Brock")).toBe(true);
    expect(tips.every((tip) => tip.source === "Brawl Calculator" && tip.reason.length > 0)).toBe(true);
    expect(new Set(tips.map((tip) => `${tip.reason}:${tip.sourceUrl}`)).size).toBe(tips.length);
  });

  it("preserves the literal Brawl Calculator wording for the Cordelius versus Damian duel", () => {
    const tips = getBrawlCalculatorTips("Cordelius", "Damian");

    expect(tips).toEqual(expect.arrayContaining([
      expect.objectContaining({
        attacker: "Cordelius",
        defender: "Damian",
        reason: "Silences Damian with Poison Mushroom , preventing his short-range punches during the window when he finally closes distance.",
        source: "Brawl Calculator",
        sourceUrl: "https://brawlcalculator.com/counters/damian/",
      }),
    ]));
  });

  it("provides a Portuguese translation while retaining the original Brawl Calculator wording as the key", () => {
    const literalReason = "Silences Damian with Poison Mushroom , preventing his short-range punches during the window when he finally closes distance.";

    expect(getBrawlCalculatorTipTranslation(literalReason)).toBe("Silencia Damian com Poison Mushroom , evitando seus socos de curto alcance durante a janela quando ele finalmente se aproxima.");
    expect(getBrawlCalculatorTipTranslation("Unknown literal tip")).toBe("Unknown literal tip");
  });

  it("exposes profile tips for fallback when a selected pair has no direct explanation", () => {
    const tips = getBrawlCalculatorTipsForBrawler("Berry");

    expect(tips.length).toBeGreaterThan(0);
    expect(tips.every((tip) => tip.source === "Brawl Calculator" && tip.reason.length > 0)).toBe(true);
    expect(tips.every((tip) => tip.attacker === "Berry" || tip.defender === "Berry")).toBe(true);
  });

  it("uses the BrawlScope direction when sources contradict each other", () => {
    const result = resolveCounterDirectionFromProfiles(
      "Bea",
      "Bibi",
      [
        profile("Brawl Calculator", ["Bibi"]),
        profile("BrawlScope", [], ["Bibi"]),
      ],
      [],
    );

    expect(result).toMatchObject({ direction: "counteredBy", source: "BrawlScope" });
  });

  // A ordem de prioridade passou a ser BrawlScope → Brawl Planet → PL Prodigy: o
  // Brawl Calculator saiu da decisão de direção e já não pode vencer o Brawl
  // Planet, para o mesmo confronto não ser contado por duas leituras diferentes.
  it("ignores Brawl Calculator and uses Brawl Planet when BrawlScope is silent", () => {
    const result = resolveCounterDirectionFromProfiles(
      "Bea",
      "Bibi",
      [
        profile("Brawl Calculator", ["Bibi"]),
        profile("Brawl Planet", [], ["Bibi"]),
      ],
      [],
    );

    expect(result).toMatchObject({ direction: "counteredBy", source: "Brawl Planet" });
  });

  // Este teste auditava a prioridade do Brawl Calculator, que já não existe: o
  // loop abaixo nunca encontraria um perfil e passaria sempre em vazio. Fica a
  // asserção que continua a ter conteúdo — nenhum brawler do Ranked expõe hoje um
  // perfil Brawl Calculator no resolver, e nenhuma direção é atribuída a ele.
  it("no longer exposes Brawl Calculator relations through the Draft resolver", () => {
    const brawlers = Array.from(new Set(allRankedRows.map((row) => row.brawler)));

    expect(brawlers.length).toBeGreaterThan(90);
    for (const attacker of brawlers) {
      expect(getCounterSourceProfiles(attacker).map((profile) => profile.source), attacker).not.toContain("Brawl Calculator");
      for (const defender of brawlers) {
        if (defender === attacker) continue;
        expect(getResolvedCounterDirection(attacker, defender)?.source, `${attacker} → ${defender}`).not.toBe("Brawl Calculator");
      }
    }
  });

  // O Brawl Calculator deixou de resolver direções no Draft: sozinho já não
  // decide nada. Continua a alimentar as dicas táticas do mesmo par, que é hoje
  // o único papel da fonte.
  it("does not apply a lone Brawl Calculator counter in the Draft resolver", () => {
    const result = resolveCounterDirectionFromProfiles(
      "Cordelius",
      "Bibi",
      [profile("Brawl Calculator", ["Bibi"])],
      [],
    );

    expect(result).toBeNull();
    expect(getCounterSourceProfiles("Cordelius").map((item) => item.source)).not.toContain("Brawl Calculator");
    expect(getBrawlCalculatorTipsForBrawler("Cordelius").length).toBeGreaterThan(0);
  });

  // ATENÇÃO: este teste fica vermelho de propósito. `excludedCounterDirections`
  // ("glowy:bolt") só é aplicado às relações vindas do snapshot e ao Brawl Planet;
  // o catálogo BrawlScope estático e a tabela de deltas não passam por
  // `isExcludedCounterDirection`, por isso a mesma direção rejeitada volta a ser
  // canónica quando vem dessa via. Ou o filtro se aplica a todas as fontes, ou a
  // rejeição deve ser retirada — a meio caminho é que não pode ficar.
  it("suppresses the rejected Glowy to Bolt source direction from canonical Draft relations", () => {
    const glowyPlanet = getCounterSourceProfiles("Glowy").find((profile) => profile.source === "Brawl Planet");

    expect(glowyPlanet?.targets.some((target) => target.brawler === "Bolt")).toBe(false);
    expect(getResolvedCounterDirection("Glowy", "Bolt")).not.toMatchObject({ direction: "targets" });
  });
});
