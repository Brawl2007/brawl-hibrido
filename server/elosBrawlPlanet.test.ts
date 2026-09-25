import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { aplicarElo, enderecoDoElo, lerElosDoBrawlPlanet, mapaTemElo, type ElosNaSnapshot } from "@shared/elosBrawlPlanet";
import { mergeRows, type SourceResult } from "./rankedSync";

/**
 * O formato é o dos ficheiros públicos do Brawl Planet
 * (storage.googleapis.com/brawlanalyzer-public/pl-*-results.json.gz): um objeto
 * por slug de mapa, com `individual` [{brawler, wr, ur, sr}] e `match_count`.
 * Números inventados; a forma é a real.
 */
const ficheiro = (mapas: Record<string, { jogos: number; linhas: Array<[string, number, number, number]> }>) =>
  Object.fromEntries(Object.entries(mapas).map(([slug, { jogos, linhas }]) => [slug, {
    map: slug, mode: "knockout", match_count: jogos, active: true, teams: [],
    individual: linhas.map(([brawler, wr, ur, sr]) => ({ brawler, wr, ur, sr })),
  }]));

const ficheiros = {
  all: ficheiro({ bellesrock_knockout: { jogos: 1000, linhas: [["WENDY", 60.4, 2.9, 16.2], ["LARRY & LAWRIE", 50, 1, 10]] }, hardrockmine_gemgrab: { jogos: 900, linhas: [["MORTIS", 50, 30, 12]] } }),
  d1: ficheiro({ bellesrock_knockout: { jogos: 500, linhas: [["WENDY", 58.5, 0.7, 13.8]] }, hardrockmine_gemgrab: { jogos: 400, linhas: [["MORTIS", 49, 25, 11]] } }),
  m1: ficheiro({ bellesrock_knockout: { jogos: 280, linhas: [["WENDY", 59.1, 3.1, 15.1], ["LARRY & LAWRIE", 52, 2, 11]] } }),
  l1: ficheiro({ bellesrock_knockout: { jogos: 180, linhas: [["WENDY", 61.3, 8.5, 17.0]] } }),
};
const slugs = new Map([["bellesrock_knockout", "Belle's Rock"], ["hardrockmine_gemgrab", "Hard Rock Mine"]]);
const nomes: Record<string, string> = { wendy: "Wendy", larrylawrie: "Larry & Lawrie", mortis: "Mortis" };
const canonico = (_mapa: string, bruto: string) => nomes[bruto.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? bruto;

describe("ler os elos do Brawl Planet", () => {
  const leitura = lerElosDoBrawlPlanet(ficheiros, slugs, canonico);

  it("junta os quatro elos por mapa e brawler, com os nomes do site", () => {
    expect(leitura.porLinha.get("Belle's Rock::Wendy")).toEqual({
      todos: [60.4, 2.9, 16.2],
      porElo: { d1: [58.5, 0.7, 13.8], m1: [59.1, 3.1, 15.1], l1: [61.3, 8.5, 17.0] },
    });
    expect(leitura.porLinha.get("Belle's Rock::Larry & Lawrie")?.porElo).toEqual({ m1: [52, 2, 11] });
    expect(leitura.lidos).toEqual(["all", "d1", "m1", "l1"]);
  });

  it("um mapa que um elo não traz não tem jogos nesse elo — não é zero, é ausência", () => {
    expect(leitura.jogos["Hard Rock Mine"]).toEqual({ all: 900, d1: 400 });
    expect(leitura.jogos["Belle's Rock"]).toEqual({ all: 1000, d1: 500, m1: 280, l1: 180 });
  });

  it("um ficheiro que falhou fica de fora e não apaga os outros", () => {
    const parcial = lerElosDoBrawlPlanet({ all: ficheiros.all, d1: undefined, m1: "lixo", l1: ficheiros.l1 }, slugs, canonico);
    expect(parcial.lidos).toEqual(["all", "l1"]);
    expect(parcial.porLinha.get("Belle's Rock::Wendy")?.porElo).toEqual({ l1: [61.3, 8.5, 17.0] });
  });

  it("os endereços são os ficheiros públicos que o próprio Brawl Planet usa", () => {
    expect(enderecoDoElo("pl-l1")).toBe("https://storage.googleapis.com/brawlanalyzer-public/pl-l1-results.json.gz");
  });
});

describe("aplicar o elo às linhas", () => {
  const elos: ElosNaSnapshot = { lidoEm: "2026-09-25T18:00:00Z", lidos: ["all", "d1", "m1", "l1"], jogos: { "Belle's Rock": { all: 1000, d1: 500, m1: 280, l1: 180 }, "Hard Rock Mine": { all: 900, d1: 400 } } };
  const linhas = [
    { map: "Belle's Rock", brawler: "Wendy", topBrawlWinRate: 62, topBrawlUseRate: 3, brawlPlanetWinRate: 60.4, brawlPlanetPickRate: 2.9, brawlPlanetStarPlayer: 16.2, winRate: 61.2, usage: 2.95, brawlPlanetPorElo: { d1: [58.5, 0.7, 13.8] as [number, number, number], l1: [61.3, 8.5, 17] as [number, number, number] } },
    { map: "Belle's Rock", brawler: "Larry & Lawrie", topBrawlWinRate: null, topBrawlUseRate: null, brawlPlanetWinRate: 50, brawlPlanetPickRate: 1, brawlPlanetStarPlayer: 10, winRate: 50, usage: 1, brawlPlanetPorElo: {} },
    { map: "Hard Rock Mine", brawler: "Mortis", topBrawlWinRate: 51, topBrawlUseRate: 35, brawlPlanetWinRate: 50, brawlPlanetPickRate: 30, brawlPlanetStarPlayer: 12, winRate: 50.5, usage: 32.5, brawlPlanetPorElo: { d1: [49, 25, 11] as [number, number, number] } },
  ];

  it("All ranks devolve as mesmas linhas, sem copiar nada: o site fica igual ao byte", () => {
    const { linhas: resultado, semDados } = aplicarElo(linhas, "all", elos);
    expect(resultado).toBe(linhas);
    expect(semDados).toEqual([]);
  });

  it("num elo, troca os três números do Brawl Planet e refaz a vitória e o uso juntos", () => {
    const [wendy] = aplicarElo(linhas, "d1", elos).linhas;
    expect(wendy).toMatchObject({ brawlPlanetWinRate: 58.5, brawlPlanetPickRate: 0.7, brawlPlanetStarPlayer: 13.8, winRate: 58.5, topBrawlWinRate: 62 });
    expect(wendy.usage).toBeCloseTo((3 + 0.7) / 2, 10);
  });

  it("um brawler que o elo não traz fica sem números do Brawl Planet, em vez de herdar os de All ranks", () => {
    const larry = aplicarElo(linhas, "d1", elos).linhas[1];
    expect(larry).toMatchObject({ brawlPlanetWinRate: null, brawlPlanetPickRate: null, brawlPlanetStarPlayer: null, winRate: null, usage: null });
  });

  it("um mapa sem jogos nesse elo fica em All ranks, e é dito", () => {
    const { linhas: resultado, semDados } = aplicarElo(linhas, "l1", elos);
    expect(resultado[2]).toBe(linhas[2]);
    expect(semDados).toEqual(["Hard Rock Mine"]);
    expect(mapaTemElo(elos, "Hard Rock Mine", "l1")).toBe(false);
    expect(mapaTemElo(elos, "Hard Rock Mine", "d1")).toBe(true);
  });

  it("uma snapshot anterior aos elos fica toda em All ranks", () => {
    const { linhas: resultado, semDados } = aplicarElo(linhas, "m1", undefined);
    expect(resultado).toEqual(linhas);
    expect(semDados).toEqual(["Belle's Rock", "Hard Rock Mine"]);
  });
});

describe("os elos chegam às linhas guardadas", () => {
  it("a junção das fontes leva os números por elo para a linha final", () => {
    const vazio: SourceResult = { status: "failed", rows: new Map() };
    const planet: SourceResult = { status: "success", rows: new Map([["Belle's Rock::Wendy", { map: "Belle's Rock", brawlPlanetWinRate: 60.4, brawlPlanetPickRate: 2.9, brawlPlanetStarPlayer: 16.2, brawlPlanetPorElo: { l1: [61.3, 8.5, 17] } }]]) };
    const linha = mergeRows(vazio, planet).find((row) => row.map === "Belle's Rock" && row.brawler === "Wendy");
    expect(linha?.brawlPlanetPorElo).toEqual({ l1: [61.3, 8.5, 17] });
  });

  it("os ficheiros de elo não passam pelo pedido disfarçado das páginas", () => {
    const fonte = readFileSync(resolve(process.cwd(), "server/rankedSync.ts"), "utf8");
    const funcao = fonte.slice(fonte.indexOf("async function lerFicheirosDosElos"), fonte.indexOf("async function collectBrawlPlanet"));
    expect(funcao).toContain("await fetch(enderecoDoElo(ficheiro)");
    expect(funcao).not.toContain("fetchText(");
    expect(funcao).not.toMatch(/Mozilla|Chrome\/|sec-ch-ua/);
  });

  it("o elo é aplicado num só sítio, e o seletor está nos mapas e no Draft", () => {
    const contexto = readFileSync(resolve(process.cwd(), "client/src/contexts/RankedSyncContext.tsx"), "utf8");
    expect(contexto).toContain("aplicarElo(payload.rows, elo, payload.elosBrawlPlanet)");
    for (const pagina of ["client/src/pages/Home.tsx", "client/src/pages/Draft.tsx"]) {
      expect(readFileSync(resolve(process.cwd(), pagina), "utf8")).toContain("<SeletorDeElo mapa=");
    }
  });
});
