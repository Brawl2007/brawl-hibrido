import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import { getCounterProfile } from "../shared/draft";
import { brawlScopeCounterData } from "../shared/brawlScopeCounterData";

// Estes testes auditam catálogos estáticos; produção continua a exigir snapshot live.
beforeEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));
afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: false }));

describe("fonte de counters do Draft", () => {
  it("preserva no Draft a direção original do catálogo para perfis não excecionados", () => {
    const source = brawlScopeCounterData.brock;
    const brock = getCounterProfile("Brock", ["Brock", ...source.targets, ...source.counteredBy]);
    const normalized = (names: string[]) => names.map((name) => name.trim().toLocaleLowerCase("pt-PT"));

    expect(normalized(brock.counters.slice(0, source.targets.length))).toEqual(normalized(source.targets));
    expect(normalized(brock.counteredBy.slice(0, source.counteredBy.length))).toEqual(normalized(source.counteredBy));
    expect(normalized(brock.counters)).toEqual(expect.arrayContaining(normalized(source.targets)));
    expect(normalized(brock.counteredBy)).toEqual(expect.arrayContaining(normalized(source.counteredBy)));
    expect(source.sourceUrl).toBe("https://brawlscope.com/counters?brawler=brock");
  });

  it("já não aplica qualquer troca de listas, incluindo em Ruffs", () => {
    const source = brawlScopeCounterData.ruffs;
    const ruffs = getCounterProfile("Ruffs", ["Ruffs", ...source.targets, ...source.counteredBy]);
    const normalized = (names: string[]) => names.map((name) => name.trim().toLocaleLowerCase("pt-PT"));

    expect(normalized(ruffs.counters.slice(0, source.targets.length))).toEqual(normalized(source.targets));
    expect(normalized(ruffs.counteredBy.slice(0, source.counteredBy.length))).toEqual(normalized(source.counteredBy));
  });

  it("guarda em counteredBy quem pune o titular, na orientação publicada", () => {
    // Verificado na página pública: "Counter with · Doug" na ficha de Nori.
    expect(brawlScopeCounterData.nori.counteredBy).toContain("Doug");
    expect(brawlScopeCounterData.nori.targets).toContain("Mico");
    expect(brawlScopeCounterData["8-bit"].counteredBy).toContain("Barley");
    expect(brawlScopeCounterData["8-bit"].targets).toContain("Darryl");
  });
});
