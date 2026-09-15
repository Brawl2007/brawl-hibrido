import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getBrawlScopeLiveViews,
  getMatchupValue,
  setBrawlScopeLiveMatchups,
  setBrawlScopeReading,
} from "@shared/counterMatchupValue";
import { DEFAULT_BRAWLSCOPE_READING } from "@shared/brawlScopeReading";
import { setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import { parseBrawlScopeEveryMatchup } from "./counterSync";

const linha = (nome: string, taxa: number, media: number, delta: string) =>
  `<a href="/counters/${nome.toLowerCase()}?mode=knockout"><span>${nome}</span> ${taxa}% vs ${media}% usual · 562 battles ${delta}</a>`;

beforeEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));
afterEach(() => {
  setCounterSyncSnapshot(undefined, { allowOfflineFallback: false });
  setBrawlScopeReading(DEFAULT_BRAWLSCOPE_READING);
  for (const view of getBrawlScopeLiveViews()) setBrawlScopeLiveMatchups(view, null);
});

describe("tabela completa lida da mesma página", () => {
  it("aceita a linha que fecha o checksum impresso e descarta a que não fecha", () => {
    const html = [
      linha("Poco", 60.0, 43.2, "+16.8"),
      linha("Doug", 68.9, 54.4, "+14.5"),
      linha("Mico", 40.0, 55.0, "-15.0"),
      linha("Gus", 60.0, 43.2, "+99.9"),
    ].join("\n");

    const { deltas, descartadas } = parseBrawlScopeEveryMatchup(html, ["Poco", "Doug", "Mico", "Gus"]);

    expect(deltas).toEqual({ Poco: 16.8, Doug: 14.5, Mico: -15 });
    expect(descartadas).toBe(1);
  });

  it("ignora nomes que não pertencem ao roster conhecido", () => {
    const { deltas, descartadas } = parseBrawlScopeEveryMatchup(linha("Inventado", 60, 50, "+10"), ["Poco"]);

    expect(deltas).toEqual({});
    expect(descartadas).toBe(1);
  });
});

describe("matrizes em direto", () => {
  it("substituem o catálogo do projeto e voltam atrás quando são limpas", () => {
    setBrawlScopeReading("byMode");
    const catalogo = getMatchupValue("Nori", "Doug", "gemGrab").total;

    const pares = setBrawlScopeLiveMatchups("gemGrab", { Nori: { Doug: -20 } });
    expect(pares).toBe(1);
    expect(getBrawlScopeLiveViews()).toContain("gemGrab");
    // −20 publicado é vantagem de 20 para a Nori naquele modo.
    expect(getMatchupValue("Nori", "Doug", "gemGrab").total).toBeGreaterThan(0);

    setBrawlScopeLiveMatchups("gemGrab", null);
    expect(getMatchupValue("Nori", "Doug", "gemGrab").total).toBe(catalogo);
  });

  it("usa a matriz geral em direto para um modo ainda sem recolha", () => {
    setBrawlScopeReading("byMode");
    setBrawlScopeLiveMatchups("overall", { Nori: { Doug: -30 } });

    expect(getMatchupValue("Nori", "Doug", "heist").total).toBeGreaterThan(0);
    expect(getMatchupValue("Nori", "Doug").total).toBeGreaterThan(0);
  });
});
