import { describe, expect, it } from "vitest";
import { lerIndiceTopBrawl, lerPaginaTopBrawl } from "@shared/topBrawlParser";
import { parseTopBrawl, linhasParaSyncRows } from "./rankedSync";
import { RANKED_MAP_SOURCES } from "@shared/rankedMaps";

/**
 * Como a página do TopBrawl publica os números: em JSON embutido, não na tabela
 * visível. Vem escapado dentro de outra string, que é como os frameworks
 * modernos servem os dados da página.
 */
const pagina = (linhas: string) => `<html><body><script>self.__next_f.push([1,"{\\"maps\\":[{${linhas}}]}"])</script></body></html>`;
const linha = (id: number, nome: string, win: number, use: number, ef: number) =>
  `\\"brawlerId\\":${id},\\"brawlerName\\":\\"${nome}\\",\\"rank\\":1,\\"winRate\\":${win},\\"useRate\\":${use},\\"effectivityRate\\":${ef}`;

describe("leitura das páginas do TopBrawl", () => {
  it("lê os números publicados e põe-nos em percentagem", () => {
    const [lido] = lerPaginaTopBrawl(pagina(linha(16000000, "Shelly", 0.5137, 0.0812, 2.5)));
    expect(lido.brawler).toBe("Shelly");
    expect(lido.brawlerId).toBe(16000000);
    // A fonte publica frações; a conversão para percentagem traz o resto
    // habitual da vírgula flutuante, que não é assunto deste teste.
    expect(lido.topBrawlWinRate).toBeCloseTo(51.37, 6);
    expect(lido.topBrawlUseRate).toBeCloseTo(8.12, 6);
    expect(lido.topBrawlScore).toBeCloseTo(50, 6);
  });

  it("aceita ausência de número sem inventar zero", () => {
    // Zero é um valor; "não publicado" não é. Confundi-los faz um brawler sem
    // amostra parecer o pior do mapa.
    const [lido] = lerPaginaTopBrawl(pagina(linha(1, "Nita", 0.5, 0.1, 1).replace("\\\"winRate\\\":0.5", "\\\"winRate\\\":null")));
    expect(lido.topBrawlWinRate).toBeNull();
    expect(lido.topBrawlUseRate).toBe(10);
  });

  it("não repete um brawler que a página liste duas vezes", () => {
    const linhas = lerPaginaTopBrawl(pagina(`${linha(1, "Bibi", 0.5, 0.1, 1)}},{${linha(1, "Bibi", 0.6, 0.2, 2)}`));
    expect(linhas).toHaveLength(1);
  });

  /**
   * A propriedade que esta arquitetura exige.
   *
   * A recolha do TopBrawl corre fora do alojamento — daqui o site leva 403 — e
   * o servidor interpreta o que recebe. São dois sítios a ler a mesma página, e
   * duas leituras diferentes seriam uma divergência silenciosa: os números
   * continuariam a aparecer, só que errados, e ninguém repararia.
   *
   * Por isso há um só interpretador, e é isto que o comprova.
   */
  it("o servidor e a recolha externa leem a mesma página da mesma maneira", () => {
    const html = pagina(`${linha(16000000, "Shelly", 0.5137, 0.0812, 2.5)}},{${linha(16000001, "Colt", 0.4821, 0.0533, 1.9)}`);
    const noServidor = parseTopBrawl(html, "Hard Rock Mine");
    const foraEDepoisTraduzido = linhasParaSyncRows(lerPaginaTopBrawl(html), "Hard Rock Mine");
    expect(Object.fromEntries(foraEDepoisTraduzido)).toEqual(Object.fromEntries(noServidor));
    expect(noServidor.size).toBe(2);
  });

  it("lê os ids dos mapas no índice, nas duas formas em que aparecem", () => {
    const indice = `<a href="https://topbrawl.com/rankeds/15000007">A</a><a href="/rankeds/15000010">B</a>`;
    expect(lerIndiceTopBrawl(indice).sort()).toEqual(["15000007", "15000010"]);
  });

  it("a lista de mapas é a mesma dos dois lados e não tem ids repetidos", () => {
    const ids = RANKED_MAP_SOURCES.map(([, id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^\d+$/.test(id))).toBe(true);
  });
});
