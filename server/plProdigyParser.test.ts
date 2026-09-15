import { describe, expect, it } from "vitest";
import {
  PL_PRODIGY_MIN_GUIDES,
  parsePLProdigyGuide,
  plProdigyGuideUrl,
  plProdigySlug,
} from "@shared/plProdigyParser";
import { plProdigyCounterData } from "@shared/plProdigyCounterData";

const roster = ["8-Bit", "Brock", "Bo", "Bonnie", "El Primo", "Larry & Lawrie", "Larry", "Mr. P", "R-T", "Shelly", "Maisie", "Nori"];

/** Estrutura das guias públicas, com os dois títulos de matchup que o parser exige. */
function guiaHtml(brawler: string, contra: string[], sofre: string[]) {
  return `<!doctype html><html><body>
    <h1>${brawler} Guide</h1>
    <p>Some intro text about ${brawler} and how to play.</p>
    <h2>${brawler} Counters These Brawlers</h2>
    <ul>${contra.map((n) => `<li><a href="/x">${n}</a></li>`).join("")}</ul>
    <h2>Watch Out</h2><p>Positioning notes.</p>
    <h2>Brawlers That Counter ${brawler}</h2>
    <ul>${sofre.map((n) => `<li><a href="/x">${n}</a></li>`).join("")}</ul>
    <footer>A legacy guide · Privacy Policy</footer>
  </body></html>`;
}

describe("leitura das guias do PL Prodigy", () => {
  it("separa as duas listas publicadas", () => {
    const guia = parsePLProdigyGuide(guiaHtml("Brock", ["Shelly", "El Primo"], ["Maisie", "Nori"]), "Brock", roster);

    expect(guia?.targets).toEqual(["Shelly", "El Primo"]);
    expect(guia?.counteredBy).toEqual(["Maisie", "Nori"]);
    expect(guia?.sourceUrl).toBe("https://powerleagueprodigy.com/brock");
  });

  it("mantém a ordem publicada, que é o Top da fonte", () => {
    const guia = parsePLProdigyGuide(guiaHtml("Brock", ["Nori", "Shelly", "Maisie"], ["Bo"]), "Brock", roster);
    expect(guia?.targets).toEqual(["Nori", "Shelly", "Maisie"]);
  });

  it("não confunde nomes que são prefixo de outros", () => {
    /**
     * "Bo" está contido em "Bonnie" e "Larry" em "Larry & Lawrie". Sem fronteira
     * de palavra e sem procurar do nome mais longo para o mais curto, a lista
     * enchia-se de brawlers que a página nunca mencionou.
     */
    const guia = parsePLProdigyGuide(guiaHtml("Brock", ["Bonnie", "Larry & Lawrie"], ["Bo"]), "Brock", roster);

    expect(guia?.targets).toEqual(["Bonnie", "Larry & Lawrie"]);
    expect(guia?.targets).not.toContain("Bo");
    expect(guia?.targets).not.toContain("Larry");
    expect(guia?.counteredBy).toEqual(["Bo"]);
  });

  it("nunca põe o próprio brawler na sua lista", () => {
    const guia = parsePLProdigyGuide(guiaHtml("Brock", ["Brock", "Shelly"], ["Brock", "Nori"]), "Brock", roster);

    expect(guia?.targets).toEqual(["Shelly"]);
    expect(guia?.counteredBy).toEqual(["Nori"]);
  });

  it("devolve null quando falta uma das secções, em vez de metade dos dados", () => {
    const semSegunda = `<html><body><h2>Brock Counters These Brawlers</h2><p>Shelly</p></body></html>`;

    expect(parsePLProdigyGuide(semSegunda, "Brock", roster)).toBeNull();
    expect(parsePLProdigyGuide("", "Brock", roster)).toBeNull();
    expect(parsePLProdigyGuide("<html><body>Em manutenção</body></html>", "Brock", roster)).toBeNull();
  });

  it("não rebenta com HTML estranho", () => {
    for (const entrada of ["<<<>>>", "a".repeat(3000), "<h2>Counters These Brawlers</h2>"]) {
      expect(() => parsePLProdigyGuide(entrada, "Brock", roster)).not.toThrow();
    }
  });

  it("constrói o endereço certo para os nomes com pontuação", () => {
    expect(plProdigySlug("8-Bit")).toBe("8-bit");
    expect(plProdigySlug("El Primo")).toBe("el-primo");
    expect(plProdigySlug("Mr. P")).toBe("mr-p");
    expect(plProdigySlug("R-T")).toBe("r-t");
    expect(plProdigySlug("Larry & Lawrie")).toBe("larry-lawrie");
    expect(plProdigyGuideUrl("Shelly")).toBe("https://powerleagueprodigy.com/shelly");
  });

  it("gera os mesmos endereços que o catálogo já auditado", () => {
    // Se os endereços divergirem, a recolha em direto lê páginas erradas — e
    // isso não daria erro, daria dados de outro brawler.
    const divergentes = Object.values(plProdigyCounterData)
      .filter((entry) => plProdigyGuideUrl(entry.brawler).toLowerCase() !== entry.sourceUrl.toLowerCase())
      .map((entry) => `${entry.brawler}: ${plProdigyGuideUrl(entry.brawler)} ≠ ${entry.sourceUrl}`);

    expect(divergentes).toEqual([]);
  });

  it("exige uma leitura ampla antes de substituir o catálogo", () => {
    // A mesma disciplina da rotação: um parser partido não pode passar por
    // "a fonte deixou de publicar".
    expect(PL_PRODIGY_MIN_GUIDES).toBeGreaterThanOrEqual(60);
    expect(PL_PRODIGY_MIN_GUIDES).toBeLessThan(Object.keys(plProdigyCounterData).length);
  });
});
