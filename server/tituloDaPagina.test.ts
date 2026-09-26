import { describe, expect, it } from "vitest";
import { tituloDaPagina } from "../client/src/lib/tituloDaPagina";

describe("o nome de cada página no separador", () => {
  it("cada página tem o seu", () => {
    expect(tituloDaPagina("/")).toBe("Brawl Híbrido — Ranked");
    expect(tituloDaPagina("/draft")).toBe("Draft · Brawl Híbrido");
    expect(tituloDaPagina("/draft/")).toBe("Draft · Brawl Híbrido");
    expect(tituloDaPagina("/matchups")).toBe("Matriz 1v1 · Brawl Híbrido");
    expect(tituloDaPagina("/brawlers")).toBe("Brawlers · Brawl Híbrido");
    expect(tituloDaPagina("/brawlers/El%20Primo")).toBe("El Primo · Brawl Híbrido");
    expect(tituloDaPagina("/brawlers/%E0%A4%A")).toBe("%E0%A4%A · Brawl Híbrido");
    expect(tituloDaPagina("/xpto")).toBe("Página não encontrada · Brawl Híbrido");
  });
});
