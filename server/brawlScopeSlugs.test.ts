import { describe, expect, it } from "vitest";
import {
  MIN_BRAWLSCOPE_SLUGS,
  brawlScopeSlugFromName,
  findBrawlScopeSlugsInIndex,
  knownBrawlScopeSlugs,
  resolveBrawlScopeSlugs,
} from "@shared/brawlScopeSlugs";

/**
 * A avaria que estes testes guardam.
 *
 * O índice `/counters` do BrawlScope passou a montar a lista no navegador. O
 * HTML servido já não tem nenhum `href="/counters/<slug>"`, e o `sitemap.xml`
 * também não os publica. Como a recolha tirava de lá os endereços, ficava com
 * zero fichas, a guarda de 80 disparava, e as sete vistas falhavam ciclo após
 * ciclo — counters gerais, counters por modo e sinergias "Pair with"
 * congelados, sem que nada no ecrã dissesse porquê.
 *
 * As fichas em si nunca deixaram de funcionar. Foi a lista que se perdeu.
 */
describe("endereços das fichas do BrawlScope", () => {
  it("lê o índice quando a fonte publica os links", () => {
    const html = Array.from({ length: 90 }, (_, index) => `<a href="/counters/brawler-${index}">x</a>`).join("");
    const resolucao = resolveBrawlScopeSlugs(html);

    expect(resolucao.origin).toBe("index");
    expect(resolucao.slugs).toHaveLength(90);
    expect(resolucao.indexCount).toBe(90);
  });

  it("um índice sem links já não cancela a vista: cai no roster conhecido", () => {
    const html = "<html><body><nav>Counters</nav><div id=\"app\"></div></body></html>";
    const resolucao = resolveBrawlScopeSlugs(html);

    expect(resolucao.indexCount).toBe(0);
    expect(resolucao.origin).toBe("roster");
    expect(resolucao.slugs.length).toBeGreaterThanOrEqual(MIN_BRAWLSCOPE_SLUGS);
  });

  it("um índice com meia dúzia de links também não serve — é leitura partida, não roster encolhido", () => {
    const html = Array.from({ length: 6 }, (_, index) => `<a href="/counters/b-${index}">x</a>`).join("");
    const resolucao = resolveBrawlScopeSlugs(html);

    expect(resolucao.origin).toBe("roster");
    expect(resolucao.slugs.length).toBeGreaterThanOrEqual(MIN_BRAWLSCOPE_SLUGS);
  });

  it("corrige o único slug cujo caminho difere do endereço guardado no catálogo", () => {
    const slugs = knownBrawlScopeSlugs();

    // `/counters/larry-and-lawrie` devolve 404 na fonte; `/counters/larry-lawrie` devolve a ficha.
    expect(slugs).toContain("larry-lawrie");
    expect(slugs).not.toContain("larry-and-lawrie");
  });

  it("deriva os slugs difíceis a partir do nome publicado", () => {
    expect(brawlScopeSlugFromName("8-Bit")).toBe("8-bit");
    expect(brawlScopeSlugFromName("Mr. P")).toBe("mr-p");
    expect(brawlScopeSlugFromName("R-T")).toBe("r-t");
    expect(brawlScopeSlugFromName("Jae-Yong")).toBe("jae-yong");
    expect(brawlScopeSlugFromName("El Primo")).toBe("el-primo");
    expect(brawlScopeSlugFromName("Starr Nova")).toBe("starr-nova");
    expect(brawlScopeSlugFromName("Larry & Lawrie")).toBe("larry-lawrie");
  });

  it("aceita brawlers novos que o catálogo do repositório ainda não conhece", () => {
    const semNovo = knownBrawlScopeSlugs();
    const comNovo = knownBrawlScopeSlugs(["Brawler Inventado"]);

    expect(semNovo).not.toContain("brawler-inventado");
    expect(comNovo).toContain("brawler-inventado");
    expect(comNovo.length).toBe(semNovo.length + 1);
  });

  it("o roster conhecido cobre o plantel inteiro, não uma amostra", () => {
    expect(knownBrawlScopeSlugs().length).toBeGreaterThanOrEqual(100);
  });

  it("filtra o índice por modo quando os links trazem o parâmetro", () => {
    const html = `<a href="/counters/shelly?mode=knockout">a</a><a href="/counters/piper?mode=bounty">b</a>`;

    expect(findBrawlScopeSlugsInIndex(html, "knockout")).toEqual(["shelly"]);
    expect(findBrawlScopeSlugsInIndex(html, "bounty")).toEqual(["piper"]);
  });

  it("não rebenta com HTML ausente", () => {
    expect(findBrawlScopeSlugsInIndex("")).toEqual([]);
    expect(resolveBrawlScopeSlugs("").origin).toBe("roster");
  });
});
