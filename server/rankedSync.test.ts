import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  createRankedSyncRun: vi.fn().mockResolvedValue(1),
  ensureRankedSyncConfig: vi.fn().mockResolvedValue(undefined),
  getRankedSyncSnapshot: vi.fn().mockResolvedValue({ version: "live-previous", rowCount: 2835 }),
  updateRankedSyncConfig: vi.fn().mockResolvedValue(undefined),
  updateRankedSyncRun: vi.fn().mockResolvedValue(undefined),
  upsertRankedSyncSnapshot: vi.fn().mockResolvedValue(undefined),
  /**
   * A recolha do TopBrawl feita fora do alojamento, que daqui leva 403.
   * Vazia por omissão: estes testes cobrem a recolha em direto.
   */
  listRankedMapCaptures: vi.fn().mockResolvedValue([]),
  countRankedMapCaptures: vi.fn().mockResolvedValue(0),
  upsertRankedMapCaptures: vi.fn().mockResolvedValue(0),
}));

vi.mock("./db", () => dbMocks);

import { buildFallbackPayload, deriveMapSummaries, getNextRefreshAt, normalizeSnapshotPayload, syncRankedData } from "./rankedSync";

describe("ranked synchronization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    dbMocks.createRankedSyncRun.mockResolvedValue(1);
    dbMocks.ensureRankedSyncConfig.mockResolvedValue(undefined);
    dbMocks.getRankedSyncSnapshot.mockResolvedValue({ version: "live-previous", rowCount: 2835 });
    dbMocks.updateRankedSyncConfig.mockResolvedValue(undefined);
    dbMocks.updateRankedSyncRun.mockResolvedValue(undefined);
    dbMocks.listRankedMapCaptures.mockResolvedValue([]);
    dbMocks.countRankedMapCaptures.mockResolvedValue(0);
    dbMocks.upsertRankedSyncSnapshot.mockResolvedValue(undefined);
  });

  it("keeps the complete fallback catalogue available", () => {
    const payload = buildFallbackPayload();

    expect(payload.maps).toHaveLength(26);
    expect(payload.rows).toHaveLength(2732);
    expect(payload.rows.every((row) => row.map && row.brawler)).toBe(true);
  });

  it("calculates the next scheduled refresh one hour after capture", () => {
    const capturedAt = new Date("2026-08-14T12:00:00.000Z");
    expect(getNextRefreshAt(capturedAt)).toEqual(new Date("2026-08-14T13:00:00.000Z"));
  });

  it("recalculates map summaries from refreshed rows", () => {
    const maps = deriveMapSummaries([
      { map: "Spiraling Out", mode: "Fute-Brawl", modeId: "brawl-ball", brawler: "Bolt", score: 91.2, tier: "S" },
      { map: "Spiraling Out", mode: "Fute-Brawl", modeId: "brawl-ball", brawler: "Ash", score: 70.1, tier: "A" },
    ]);
    const spiralingOut = maps.find((map) => map.name === "Spiraling Out");
    expect(spiralingOut).toMatchObject({ brawlerCount: 2, topScore: 91.2, tiers: { S: 1, A: 1, B: 0 } });
  });

  it("completes a partial map snapshot before normalizing scores", () => {
    const payload = normalizeSnapshotPayload({
      rows: [{
        map: "Kaboom Canyon",
        mode: "Roubo",
        modeId: "heist",
        brawler: "Ollie",
        score: 99,
        tier: "S",
        winRate: 33,
        usage: 0,
        topBrawlWinRate: 50,
        topBrawlUseRate: 0,
        brawlPlanetWinRate: 16,
        brawlPlanetPickRate: 0,
      }],
      maps: [],
      mapTeams: [],
      updatedAt: new Date(0).toISOString(),
      sourceStatus: { topBrawl: "partial", brawlPlanet: "partial" },
    });
    const kaboomRows = payload.rows.filter((row) => row.map === "Kaboom Canyon");
    const ollie = kaboomRows.find((row) => row.brawler === "Ollie");
    expect(kaboomRows).toHaveLength(105);
    expect(ollie?.score).toBeLessThan(100);
    expect(ollie?.tier).toBe("B");
  });

  it("returns no next refresh for an empty snapshot", () => {
    expect(getNextRefreshAt(null)).toBeNull();
  });

  it("preserves the previous snapshot when both sources fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("source offline")));

    const result = await syncRankedData("manual");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("última snapshot válida foi preservada");
    expect(dbMocks.upsertRankedSyncSnapshot).not.toHaveBeenCalled();
    expect(dbMocks.updateRankedSyncRun).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: "failed" }),
    );
    vi.unstubAllGlobals();
  });

  /**
   * O caso real: 26 mapas recolhidos no navegador, gravados na base, e os
   * valores no ecrã na mesma parados.
   *
   * A sincronização lia o índice do TopBrawl primeiro e, como daqui esse
   * pedido leva 403, desistia à segunda linha — antes de olhar para o que
   * estava guardado. Nos registos ficava o aviso do 403 e mais nada, o que
   * fazia a procura começar sempre pela recolha, que estava boa.
   */
  it("uses the browser-collected maps when the index is blocked", async () => {
    dbMocks.getRankedSyncSnapshot.mockResolvedValue({
      version: "live-previous",
      rowCount: 2835,
      payload: JSON.stringify({ rows: [{ map: "Hard Rock Mine", brawler: "Griff" }] }),
    });
    dbMocks.countRankedMapCaptures.mockResolvedValue(26);
    dbMocks.listRankedMapCaptures.mockResolvedValue([{
      mapId: "15000007",
      map: "Hard Rock Mine",
      capturedAt: new Date(),
      payload: JSON.stringify([
        { brawler: "Griff", brawlerId: 16000042, topBrawlWinRate: 51.37, topBrawlUseRate: 8.1, topBrawlScore: 74.2 },
      ]),
    }]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("403 Forbidden")));

    const result = await syncRankedData("manual");

    // Não basta a guarda deixar passar: o mapa guardado tem de chegar à snapshot.
    expect(result.error ?? "").not.toContain("Índice da rotação incompleto");
    expect(dbMocks.upsertRankedSyncSnapshot).toHaveBeenCalled();
    const gravada = dbMocks.upsertRankedSyncSnapshot.mock.calls[0][0] as { payload: string };
    const griff = (JSON.parse(gravada.payload) as { rows: { map: string; brawler: string; topBrawlWinRate?: number | null }[] })
      .rows.find((row) => row.map === "Hard Rock Mine" && row.brawler === "Griff");
    expect(griff?.topBrawlWinRate).toBe(51.37);
    vi.unstubAllGlobals();
  });

  /**
   * A sincronização acontece hoje; os números podem ser de ontem.
   *
   * O TopBrawl recusa pedidos vindos do alojamento, por isso os números dele
   * entram por capturas feitas no navegador. A recolha automática volta a
   * publicar essas mesmas capturas e carimbava-as com a hora de agora — o ecrã
   * dizia "Dados agora mesmo" sobre leituras do dia anterior, e ia continuar a
   * dizê-lo indefinidamente. Esta é a linha que o impede.
   */
  it("grava quando a fonte foi mesmo lida, e não a hora da sincronização", async () => {
    const ontem = new Date(Date.now() - 30 * 3600_000);
    dbMocks.getRankedSyncSnapshot.mockResolvedValue({
      version: "live-previous",
      rowCount: 2835,
      payload: JSON.stringify({ rows: [{ map: "Hard Rock Mine", brawler: "Griff" }] }),
    });
    dbMocks.countRankedMapCaptures.mockResolvedValue(26);
    dbMocks.listRankedMapCaptures.mockResolvedValue([{
      mapId: "15000007",
      map: "Hard Rock Mine",
      capturedAt: ontem,
      payload: JSON.stringify([
        { brawler: "Griff", brawlerId: 16000042, topBrawlWinRate: 51.37, topBrawlUseRate: 8.1, topBrawlScore: 74.2 },
      ]),
    }]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("403 Forbidden")));

    await syncRankedData("manual");

    const gravada = dbMocks.upsertRankedSyncSnapshot.mock.calls[0][0] as { capturedAt: Date; payload: string };
    const payload = JSON.parse(gravada.payload) as {
      updatedAt: string;
      sourceReadAt?: { topBrawl: string | null; brawlPlanet: string | null };
    };

    // A leitura declarada é a da captura, não a de agora.
    expect(payload.sourceReadAt?.topBrawl).toBe(ontem.toISOString());
    // E a hora da sincronização continua lá, à parte, porque também interessa.
    expect(new Date(payload.updatedAt).getTime()).toBeGreaterThan(ontem.getTime());
    // Com as duas fontes em baixo não se inventa uma leitura para a outra.
    expect(payload.sourceReadAt?.brawlPlanet).toBeNull();
    vi.unstubAllGlobals();
  });
});


describe("Brawl Planet table parser", () => {
  it("extracts the complete ranked table with pick and star player metrics", async () => {
    const { parseBrawlPlanet } = await import("./rankedSync");
    const html = `
      <table><thead><tr><th>#</th><th>Brawler</th><th>Win (%)</th><th>Pick (%)</th><th>Starplayer (%)</th></tr></thead>
      <tbody><tr><td>1</td><td><a><span>Bolt</span></a></td><td>66.1</td><td>7.6</td><td>26.0</td></tr>
      <tr><td>2</td><td>Ash</td><td>58.2</td><td>1.6</td><td>24.3</td></tr></tbody></table>
      <table><thead><tr><th>#</th><th>Team</th><th>Win (%)</th></tr></thead><tbody><tr><td>1</td><td>Bolt · Ash · Tara</td><td>85.0</td></tr></tbody></table>
      <table><thead><tr><th>#</th><th>Brawler</th><th>Win (%)</th><th>Pick (%)</th><th>Starplayer (%)</th></tr></thead>
      <tbody><tr><td>1</td><td>Bolt</td><td>66.1</td><td>7.6</td><td>26.0</td></tr>
      <tr><td>2</td><td>Ash</td><td>58.2</td><td>1.6</td><td>24.3</td></tr></tbody></table>`;
    const rows = parseBrawlPlanet(html, "Pit Stop");
    expect(rows.size).toBe(2);
    expect(rows.get("Bolt")).toMatchObject({ brawlPlanetWinRate: 66.1, brawlPlanetPickRate: 7.6, brawlPlanetStarPlayer: 26 });
  });

  it("keeps Wendy when a Ranked table first publishes her metrics", async () => {
    const { parseBrawlPlanet } = await import("./rankedSync");
    const html = `<table><thead><tr><th>#</th><th>Brawler</th><th>Win (%)</th><th>Pick (%)</th><th>Starplayer (%)</th></tr></thead><tbody><tr><td>1</td><td>Wendy</td><td>61.4</td><td>2.3</td><td>18.9</td></tr></tbody></table>`;
    const rows = parseBrawlPlanet(html, "Pit Stop");

    expect(rows.get("Wendy")).toMatchObject({ map: "Pit Stop", brawlPlanetWinRate: 61.4, brawlPlanetPickRate: 2.3, brawlPlanetStarPlayer: 18.9 });
  });

  it("extrai somente as primeiras dez composições literais publicadas por mapa", async () => {
    const { parseBrawlPlanetTeams } = await import("./rankedSync");
    const teamRows = [
      ["Brock · Pearl · Bolt", "81.4"], ["Tara · Gus · Lumi", "80.2"], ["Max · Sandy · Gene", "79.6"],
      ["Spike · Belle · Ruffs", "78.9"], ["Poco · Bibi · Emz", "78.2"], ["Bo · Nita · Mr. P", "77.5"],
      ["Mandy · Otis · Pam", "76.8"], ["Colt · Jessie · 8-Bit", "76.2"], ["Crow · Janet · Gray", "75.7"],
      ["Rico · Lola · Gale", "75.1"], ["Byron · Ash · Squeak", "74.4"],
    ] as const;
    const html = `<table><thead><tr><th>#</th><th>Team</th><th>Win (%)</th></tr></thead><tbody>
      <tr><td>1</td><td>Frank · Charlie · Kit</td><td>84.3</td></tr>
    </tbody></table>
    <table><thead><tr><th>#</th><th>Team</th><th>Win (%)</th></tr></thead><tbody>
      ${teamRows.map(([team, winRate], index) => `<tr><td>${index + 1}</td><td>${team}</td><td>${winRate}</td></tr>`).join("")}
    </tbody></table>`;

    const teams = parseBrawlPlanetTeams(html, "Flaring Phoenix", "https://www.brawlplanet.com/maps/flaringphoenix_knockout");
    expect(teams).toHaveLength(10);
    expect(teams[0]).toMatchObject({ brawlers: ["Brock", "Pearl", "Bolt"], winRate: 81.4 });
    expect(teams.at(-1)).toMatchObject({ brawlers: ["Rico", "Lola", "Gale"], winRate: 75.1 });
    expect(teams.some((team) => team.brawlers.includes("Byron"))).toBe(false);
  });
});


describe("TopBrawl parser", () => {
  it("decodes escaped brawler names such as Larry & Lawrie", async () => {
    const { parseTopBrawl } = await import("./rankedSync");
    const html = String.raw`{"brawlerId":16000077,"brawlerName":"Larry \u0026 Lawrie","winRate":0.515625,"useRate":0.0054902635,"effectivityRate":0.50553805}`;
    const rows = parseTopBrawl(html, "Pit Stop");
    expect(rows.get("Larry & Lawrie")).toMatchObject({ brawlerId: 16000077, topBrawlWinRate: 51.5625, topBrawlUseRate: 0.54902635 });
  });

  it("keeps Wendy when TopBrawl first publishes her Ranked metrics", async () => {
    const { parseTopBrawl } = await import("./rankedSync");
    const html = String.raw`{"brawlerId":16000106,"brawlerName":"Wendy","winRate":0.614,"useRate":0.023,"effectivityRate":0.61}`;
    const rows = parseTopBrawl(html, "Pit Stop");

    expect(rows.get("Wendy")).toMatchObject({ brawlerId: 16000106, topBrawlWinRate: 61.4, topBrawlUseRate: 2.3, topBrawlScore: 12.2 });
  });

  it("adds a new source brawler to the merged snapshot instead of discarding it", async () => {
    const { mergeRows } = await import("./rankedSync");
    const topBrawl = { status: "success" as const, rows: new Map([["Pit Stop::Wendy", { brawlerId: 16000106, topBrawlWinRate: 61.4, topBrawlUseRate: 2.3, topBrawlScore: 12.2 }]]) };
    const brawlPlanet = { status: "success" as const, rows: new Map([["Pit Stop::Wendy", { brawlPlanetWinRate: 60, brawlPlanetPickRate: 2.4 }]]) };
    const rows = mergeRows(topBrawl, brawlPlanet);
    const wendy = rows.find((row) => row.map === "Pit Stop" && row.brawler === "Wendy");
    const pitStopUsage = rows
      .filter((row) => row.map === "Pit Stop")
      .map((row) => row.usage)
      .filter((usage): usage is number => typeof usage === "number" && Number.isFinite(usage));
    const minimumUsage = Math.min(...pitStopUsage);
    const maximumUsage = Math.max(...pitStopUsage);
    const normalizedUsage = maximumUsage === minimumUsage
      ? 50
      : ((wendy!.usage! - minimumUsage) / (maximumUsage - minimumUsage)) * 100;
    const pitStopWinRates = rows
      .filter((row) => row.map === "Pit Stop")
      .map((row) => row.winRate)
      .filter((winRate): winRate is number => typeof winRate === "number" && Number.isFinite(winRate));
    const minimumWinRate = Math.min(...pitStopWinRates);
    const maximumWinRate = Math.max(...pitStopWinRates);
    const normalizedWinRate = maximumWinRate === minimumWinRate
      ? 50
      : ((wendy!.winRate! - minimumWinRate) / (maximumWinRate - minimumWinRate)) * 100;
    const expectedScore = (normalizedWinRate * 0.7) + (normalizedUsage * 0.3);

    expect(wendy).toMatchObject({ brawlerId: 16000106, dataStatus: "complete" });
    expect(wendy?.winRate).toBeCloseTo(60.7, 6);
    expect(wendy?.usage).toBeCloseTo(2.35, 6);
    expect(wendy?.score).toBeCloseTo(expectedScore, 6);
    expect(wendy?.tier).toBe(expectedScore >= 75 ? "S" : expectedScore >= 65 ? "A" : "B");
  });

  it("keeps TopBrawl as individual brawler metrics and never infers a team composition", async () => {
    const { parseTopBrawl } = await import("./rankedSync");
    const html = String.raw`{"brawlerId":16000003,"brawlerName":"Brock","winRate":0.5902,"useRate":0.3735,"effectivityRate":0.588}
      {"teamName":"Brock · Pearl · Bolt","winRate":0.814}`;
    const rows = parseTopBrawl(html, "Flaring Phoenix");

    expect([...rows.keys()]).toEqual(["Brock"]);
    expect(rows.get("Brock")?.topBrawlWinRate).toBeCloseTo(59.02, 6);
    expect(rows.get("Brock")?.topBrawlUseRate).toBeCloseTo(37.35, 6);
    expect(rows.has("Brock · Pearl · Bolt")).toBe(false);
  });
});
