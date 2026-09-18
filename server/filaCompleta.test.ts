import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RANKED_MAP_SOURCES } from "@shared/rankedMaps";
// A extensão é servida como está, sem passar pelo build: o validador que corre
// no navegador é exatamente este ficheiro.
import { validateQueue } from "../client/public/brawlscope-helper/queue.js";

const mapas = RANKED_MAP_SOURCES.map(([, id]) => `https://topbrawl.com/rankeds/${id}?rows=106`);
const fichas = ["shade", "el-primo", "amber"].map((slug) => `https://brawlscope.com/counters/${slug}`);

/**
 * As duas fontes levam 403 a partir do alojamento e dependem ambas da recolha
 * no navegador. Fazê-las em corridas separadas obriga a montar a extensão duas
 * vezes para o mesmo fim — e a segunda é fácil de adiar, com o BrawlScope a
 * envelhecer em silêncio.
 */
describe("fila completa: as duas fontes numa passagem", () => {
  it("o validador da extensão aceita as duas origens na mesma fila", () => {
    const { urls: aceites } = validateQueue({ format: "brawlhibrido-queue-v1", urls: [...fichas, ...mapas] });

    expect(aceites).toHaveLength(fichas.length + mapas.length);
    expect(aceites.some((url: string) => url.startsWith("https://brawlscope.com/"))).toBe(true);
    expect(aceites.some((url: string) => url.startsWith("https://topbrawl.com/"))).toBe(true);
  });

  it("o site oferece a fila completa com as duas fontes", () => {
    // Se o botão deixar de juntar as duas listas, a recolha volta a ser duas
    // corridas sem ninguém dar por isso.
    const componente = readFileSync(resolve(process.cwd(), "client/src/components/ImportarLote.tsx"), "utf8");
    expect(componente).toContain("brawl-hibrido-fila-completa.json");
    expect(componente).toContain("...refreshUrls, ...(filaDeMapas.data?.urls ?? [])");
  });

  it("continua a recusar endereços que a recolha não sabe ler", () => {
    for (const mau of ["https://exemplo.test/counters/shade", "https://brawlscope.com/outra/coisa"]) {
      // Sozinho não sobra nada para visitar, por isso atira.
      expect(() => validateQueue({ format: "brawlhibrido-queue-v1", urls: [mau] })).toThrow();
      // Acompanhado, é posto de lado — e a recolha do resto segue.
      const { urls, rejeitados } = validateQueue({ format: "brawlhibrido-queue-v1", urls: [mau, ...mapas] });
      expect(urls).not.toContain(mau);
      expect(urls).toHaveLength(mapas.length);
      expect(rejeitados.map((r) => r.url)).toEqual([mau]);
    }
  });
});
