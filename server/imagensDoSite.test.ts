import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * As imagens do site.
 *
 * Cinco ficheiros viviam na plataforma anterior, atrás de uma API com chave, e
 * nunca entraram neste repositório — o histórico confirma-o, por isso não há de
 * onde os recuperar. Enquanto os endereços `/manus-storage/...` ficaram
 * espalhados por quatro páginas, pelo `index.html` e pelo `index.css`, cada
 * carregamento pedia cinco ficheiros que não existem e o logótipo aparecia
 * partido em todas as páginas.
 */
describe("imagens do site", () => {
  const ficheiros = [
    "client/src/pages/Home.tsx",
    "client/src/pages/Draft.tsx",
    "client/src/pages/Brawlers.tsx",
    "client/src/pages/BrawlerDetail.tsx",
    "client/src/index.css",
    "client/index.html",
  ];

  it("nenhuma página pede à plataforma que já não existe", () => {
    for (const ficheiro of ficheiros) {
      expect(readFileSync(resolve(process.cwd(), ficheiro), "utf8"), ficheiro).not.toContain("/manus-storage/");
    }
  });

  it("o logótipo aponta para um ficheiro que existe mesmo", () => {
    const modulo = readFileSync(resolve(process.cwd(), "client/src/lib/imagens.ts"), "utf8");
    const endereco = /export const LOGO = "([^"]+)"/.exec(modulo)?.[1];
    expect(endereco).toBeTruthy();
    expect(existsSync(resolve(process.cwd(), "client/public", (endereco ?? "").replace(/^\//, "")))).toBe(true);
  });

  it("uma imagem ausente nunca vira o endereço \"null\"", () => {
    // `url(${null})` pede mesmo a página "null" — o pedido perdido que se queria
    // evitar. O helper existe para que isso não possa acontecer por distração.
    for (const ficheiro of ["client/src/pages/Home.tsx", "client/src/pages/Draft.tsx"]) {
      const texto = readFileSync(resolve(process.cwd(), ficheiro), "utf8");
      for (const linha of texto.split("\n")) {
        if (!linha.includes("url(${")) continue;
        expect(linha.includes("? {") || linha.includes("fundoCom("), `${ficheiro}: ${linha.trim()}`).toBe(true);
      }
    }
  });
});
