import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRAWLSCOPE_RANK,
  brawlScopeIndexUrl,
  brawlScopeProfileUrl,
  describeBrawlScopeView,
  normalizeBrawlScopeRankId,
} from "@shared/brawlScopeViews";
import { parseBrawlScopeModePage } from "./counterSync";

const profileHtml = `
  <h1>Nori counters</h1>
  <p>Counter with</p><ul><li><a href="/counters/doug"><span>Doug</span> +9.5</a></li></ul>
  <p>Punishes</p><ul><li><a href="/counters/mico"><span>Mico</span> -9.8</a></li></ul>
  <p>Pair with</p><ul><li><a href="/counters/shade"><span>Shade</span> +11.6</a></li></ul>
`;

describe("vistas públicas do BrawlScope", () => {
  it("trata Lendário+ como o valor por omissão, sem parâmetro rank", () => {
    // Verificado nos links da própria página: o filtro Legendary+ aponta para a
    // URL sem `rank`, enquanto "All ranks" é que usa `?rank=all`.
    expect(DEFAULT_BRAWLSCOPE_RANK).toBe("legendary");
    expect(brawlScopeProfileUrl("nori")).toBe("https://brawlscope.com/counters/nori");
    expect(brawlScopeProfileUrl("nori", { rankId: "legendary" })).toBe("https://brawlscope.com/counters/nori");
    expect(brawlScopeProfileUrl("nori", { rankId: "all" })).toBe("https://brawlscope.com/counters/nori?rank=all");
    expect(normalizeBrawlScopeRankId(undefined)).toBe("legendary");
    expect(normalizeBrawlScopeRankId("patente-inventada")).toBe("legendary");
  });

  it("monta a vista Overall sem filtro de modo e as vistas por modo com ele", () => {
    expect(brawlScopeIndexUrl()).toBe("https://brawlscope.com/counters");
    expect(brawlScopeIndexUrl({ modeId: "knockout" })).toBe("https://brawlscope.com/counters?mode=knockout");
    expect(brawlScopeProfileUrl("nori", { modeId: "knockout" })).toBe("https://brawlscope.com/counters/nori?mode=knockout");
    expect(brawlScopeProfileUrl("nori", { modeId: "knockout", rankId: "masters" }))
      .toBe("https://brawlscope.com/counters/nori?mode=knockout&rank=masters");
    expect(describeBrawlScopeView()).toBe("Overall · Lendário+");
  });

  it("lê a ficha Overall como leitura global, sem modo associado", () => {
    const parsed = parseBrawlScopeModePage(profileHtml, null, brawlScopeProfileUrl("nori"));

    expect(parsed?.modeId).toBeUndefined();
    expect(parsed?.mode).toBeUndefined();
    expect(parsed?.counteredBy).toEqual(["Doug"]);
    expect(parsed?.targets).toEqual(["Mico"]);
    expect(parsed?.counterDeltas.find((entry) => entry.brawler === "Doug")?.delta).toBe(9.5);
    expect(parsed?.synergies).toEqual([{ brawler: "Shade", delta: 11.6 }]);
  });
});
