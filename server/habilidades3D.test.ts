import { describe, expect, it } from "vitest";
import { brawlerClassCatalog } from "../shared/draft";
import { HABILIDADES, habilidadeDe } from "../client/src/components/habilidades3D";

describe("os ataques e os supers de cada brawler na cena", () => {
  it("como no jogo: o Mortis dá dash, o El Primo salta, a Jessie monta a torre, o Barley faz chover", () => {
    expect(habilidadeDe("Mortis").ataque).toBe("dash");
    expect(habilidadeDe("El Primo").super).toBe("salto");
    expect(habilidadeDe("Jessie").super).toBe("torreta");
    expect(habilidadeDe("Barley").super).toBe("chuva");
    expect(habilidadeDe("Amber").ataque).toBe("raio");
    // O nome não depende de maiúsculas nem de espaços à volta.
    expect(habilidadeDe("  mortis ").ataque).toBe("dash");
  });

  it("todos os nomes da lista são brawlers a sério", () => {
    const nomes = new Set(Object.keys(brawlerClassCatalog).map((n) => n.toLowerCase()));
    for (const nome of Object.keys(HABILIDADES)) expect(nomes.has(nome.toLowerCase()), nome).toBe(true);
  });

  it("quem não está na lista ataca à maneira da classe", () => {
    expect(habilidadeDe("Brawler Novo", "Lançador")).toEqual({ ataque: "arco", super: "chuva" });
    expect(habilidadeDe(undefined, "Tank")).toEqual({ ataque: "investida", super: "dash" });
    expect(habilidadeDe("Brawler Novo").ataque).toBe("reto");
  });
});
