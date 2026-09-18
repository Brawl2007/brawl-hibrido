import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveMapSummaries } from "./rankedSync";
import type { RankedRow } from "@shared/rankedTypes";

/**
 * Um mapa que entrou na rotação tem de ter imagem, sem ninguém editar nada.
 *
 * POR QUE ISTO EXISTE
 *
 * A imagem saía de uma tabela nome→id escrita à mão em `Home.tsx`. Um mapa que
 * entra na rotação não está lá, e aparecia sem imagem — com a agravante de que
 * "sem imagem" tinha exatamente a mesma cara de "a fonte não publica imagem
 * deste mapa". Foi assim que apareceu: rotação certa, mapa novo, cartão vazio.
 *
 * O id já era conhecido. É o mesmo número em três sítios — o endereço do
 * TopBrawl (`/rankeds/<id>`), a fila da extensão, e a imagem da Brawlify — e
 * estava a ser copiado à mão para uma quarta lista que ninguém atualiza.
 *
 * Agora a rotação lida leva o id até ao cartão. A tabela fica só para snapshots
 * antigas, que não o trazem.
 */

const linha = (mapa: string): RankedRow => ({
  map: mapa, mode: "Fute-Brawl", modeId: "brawl-ball",
  brawler: "Shelly", tier: "A", score: 50, winRate: 50, usage: 5,
} as RankedRow);

describe("imagem de um mapa que acabou de entrar na rotação", () => {
  it("o id da rotação chega ao cartão do mapa", () => {
    const [cartao] = deriveMapSummaries([linha("Mapa Novíssimo")], new Map([["Mapa Novíssimo", "15009999"]]));
    expect(cartao.id).toBe("15009999");
  });

  it("sem rotação conhecida o id fica por preencher, e não inventado", () => {
    const [cartao] = deriveMapSummaries([linha("Mapa Novíssimo")]);
    // "Não se sabe" tem de parecer não se saber. O cliente cai na tabela antiga.
    expect(cartao.id).toBeUndefined();
  });

  it("o cliente procura o id antes da tabela escrita à mão", () => {
    const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    // Sem comentários: eles falam da tabela antiga pelo nome, e têm de poder.
    const noEcra = home.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(noEcra).toContain("map.id ?? mapAssetIds[map.name]");
    // E nenhuma chamada volta a passar só o nome, que era o que fechava a porta.
    expect(noEcra).not.toMatch(/mapImageFor\(\s*\w+\.name\s*\)/);
  });
});
