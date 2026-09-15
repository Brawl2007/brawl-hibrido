import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import { buildBrawlerCatalog, normalizeBrawlerCatalogName } from "../shared/brawlerCatalog";
import { getCounterProfile } from "../shared/draft";
import { brawlScopeCounterData } from "../shared/brawlScopeCounterData";
import { BRAWL_PLANET_ATTACK_RANGE_SOURCE_URL, getBrawlerAttackRangeBand } from "../shared/brawlerAttackRangeBands";
import { allBrawlerCatalogRows, allRankedRows, normalizeRankedRows } from "../client/src/data/rankedData";

const rows = [
  {
    map: "Pit Stop",
    mode: "Roubo",
    modeId: "heist",
    brawler: "Bolt",
    brawlerId: 101,
    score: 78,
    tier: "S" as const,
    brawlPlanetWinRate: 68.4,
    brawlPlanetPickRate: 12.9,
  },
  {
    map: "Center Stage",
    mode: "Fute-Brawl",
    modeId: "brawl-ball",
    brawler: "Bolt",
    brawlerId: 101,
    score: 72,
    tier: "A" as const,
    brawlPlanetWinRate: 64.2,
    brawlPlanetPickRate: 8.1,
  },
  {
    map: "Goldarm Gulch",
    mode: "Roubo",
    modeId: "heist",
    brawler: "Grom",
    brawlerId: 102,
    score: 74,
    tier: "A" as const,
    brawlPlanetWinRate: 63.1,
    brawlPlanetPickRate: 7.2,
  },
  {
    map: "Belle's Rock",
    mode: "Nocaute",
    modeId: "knockout",
    brawler: "Gale",
    brawlerId: 103,
    score: 76,
    tier: "S" as const,
    brawlPlanetWinRate: 67.1,
    brawlPlanetPickRate: 9.6,
  },
];

// Estes testes auditam catálogos estáticos; produção continua a exigir snapshot live.
beforeEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));
afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: false }));

describe("Brawler catalog", () => {
  it("lists Wendy with published Ranked metrics and keeps her in the Draft pool", () => {
    const catalog = buildBrawlerCatalog(normalizeRankedRows(allBrawlerCatalogRows));
    const wendy = catalog.find((item) => item.brawler === "Wendy");

    expect(wendy).toMatchObject({ isRankedAvailable: true, bestRow: { score: expect.any(Number) }, winRate: expect.any(Number), usageRate: expect.any(Number) });
    expect(allRankedRows.some((row) => row.brawler === "Wendy")).toBe(true);
  });

  it("deduplicates brawlers and preserves the strongest reference row", () => {
    const catalog = buildBrawlerCatalog(rows);
    expect(catalog).toHaveLength(3);

    const bolt = catalog.find((item) => item.brawler === "Bolt");
    expect(bolt?.bestRow.score).toBe(78);
    expect(bolt?.bestRow.map).toBe("Pit Stop");
  });

  it("preserva a orientação original do catálogo BrawlScope em perfis Draft não excecionados", () => {
    const source = brawlScopeCounterData.willow;
    const willow = getCounterProfile("Willow", [...source.targets, ...source.counteredBy]);
    expect(willow.counters.slice(0, source.targets.length)).toEqual(source.targets);
    expect(willow.counteredBy.slice(0, source.counteredBy.length)).toEqual(source.counteredBy);
    expect(willow.counters).toEqual(expect.arrayContaining(source.targets));
    expect(willow.counteredBy).toEqual(expect.arrayContaining(source.counteredBy));
  });

  it("keeps only the literal BrawlScope profiles that were publicly readable", () => {
    const roster = [...new Set(allRankedRows.map((row) => row.brawler))];
    const entries = Object.entries(brawlScopeCounterData);

    // A fonte passou a publicar uma tabela legível para todo o roster — a Wendy
    // incluída — por isso o teste deixa de fixar 104 perfis e 106 brawlers e passa
    // a auditar a regra: nenhum perfil publicado fora do roster Ranked, e nenhum
    // perfil vazio ou acima do Top 10 em qualquer sentido.
    const rosterKeys = new Set(roster.map((brawler) => normalizeBrawlerCatalogName(brawler)));
    expect(roster.length).toBeGreaterThan(90);
    expect(entries.length).toBeLessThanOrEqual(roster.length);
    for (const [key] of entries) {
      expect(rosterKeys.has(normalizeBrawlerCatalogName(key)), `${key} fora do roster Ranked`).toBe(true);
    }
    for (const [key, entry] of entries) {
      expect(entry.sourceUrl).toMatch(/^https:\/\/brawlscope\.com\/counters\?brawler=/);
      expect(entry.targets.length + entry.counteredBy.length).toBeGreaterThan(0);
      expect(entry.targets.length).toBeLessThanOrEqual(10);
      expect(entry.counteredBy.length).toBeLessThanOrEqual(10);
    }
  });

  it("keeps image-ready identity and role data available for every card", () => {
    const catalog = buildBrawlerCatalog(rows);
    for (const item of catalog) {
      expect(item.brawler).toBeTruthy();
      expect(item.role).toMatch(/mid|side|flex/);
      expect(item.build).toBeDefined();
      expect(item.bestRow.brawlerId).toBeTypeOf("number");
    }
  });

  it("cobre as 105 faixas publicadas pelo Brawl Planet e sinaliza Bolt sem inventar uma faixa", () => {
    const catalog = buildBrawlerCatalog(allBrawlerCatalogRows);
    expect(catalog).toHaveLength(106);

    const withoutPublishedBand = catalog.filter((item) => !getBrawlerAttackRangeBand(item.brawler));
    expect(withoutPublishedBand.map((item) => item.brawler)).toEqual(["Bolt"]);

    for (const item of catalog.filter((item) => item.brawler !== "Bolt")) {
      const range = getBrawlerAttackRangeBand(item.brawler);
      expect(range, `${item.brawler} sem faixa de alcance`).not.toBeNull();
      expect(range?.sourceUrl).toBe(BRAWL_PLANET_ATTACK_RANGE_SOURCE_URL);
      expect(range?.minTiles).toBeLessThanOrEqual(range?.maxTiles ?? 0);
    }
  });

  it("mantém as faixas de referência para longo, médio e curto alcance", () => {
    expect(getBrawlerAttackRangeBand("8-Bit")).toMatchObject({ id: "S", minTiles: 9.5, maxTiles: 10.9 });
    expect(getBrawlerAttackRangeBand("Tick")).toMatchObject({ id: "A", minTiles: 8, maxTiles: 9.4 });
    expect(getBrawlerAttackRangeBand("Larry & Lawrie")).toMatchObject({ id: "B", minTiles: 6.5, maxTiles: 7.9 });
    expect(getBrawlerAttackRangeBand("Nori")).toMatchObject({ id: "D", minTiles: 3.5, maxTiles: 4.9 });
    expect(getBrawlerAttackRangeBand("Mortis")).toMatchObject({ id: "F", minTiles: 2, maxTiles: 3.4 });
  });
});
