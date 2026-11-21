import { describe, expect, it } from "vitest";
import { enderecoDoDraft, idDoMapaNaRota, resolverMapaDaRota } from "@shared/mapaNaRota";

const catalogo = [
  { name: "Beach Ball" },
  { name: "Hard Rock Mine" },
  { name: "Belle's Rock" },
  { name: "Center Stage" },
];

describe("mapa no endereço (v186)", () => {
  it("gera um identificador estável e legível", () => {
    expect(idDoMapaNaRota("Hard Rock Mine")).toBe("hard-rock-mine");
    expect(idDoMapaNaRota("Belle's Rock")).toBe("belles-rock");
    expect(idDoMapaNaRota("  Center   Stage ")).toBe("center-stage");
  });

  it("encontra o mapa pelo identificador ou pelo nome", () => {
    expect(resolverMapaDaRota(catalogo, "hard-rock-mine").mapa?.name).toBe("Hard Rock Mine");
    expect(resolverMapaDaRota(catalogo, "Hard Rock Mine").mapa?.name).toBe("Hard Rock Mine");
    expect(resolverMapaDaRota(catalogo, "BELLES-ROCK").mapa?.name).toBe("Belle's Rock");
  });

  it("um mapa que saiu do catálogo é desconhecido, não um mapa vazio", () => {
    const resultado = resolverMapaDaRota(catalogo, "pit-stop");
    expect(resultado.estado).toBe("desconhecido");
    expect(resultado.mapa).toBeNull();
    expect(resultado.pedido).toBe("pit-stop");
  });

  it("sem pedido não escolhe nada por si", () => {
    expect(resolverMapaDaRota(catalogo, null).estado).toBe("sem-pedido");
    expect(resolverMapaDaRota(catalogo, "   ").estado).toBe("sem-pedido");
  });

  it("o endereço do Draft leva o mapa e a intenção de brawler", () => {
    expect(enderecoDoDraft({ name: "Hard Rock Mine" })).toBe("/draft?map=hard-rock-mine");
    expect(enderecoDoDraft({ name: "Center Stage" }, "Willow")).toBe("/draft?map=center-stage&brawler=Willow");
    expect(enderecoDoDraft(null, "Mr. P")).toBe("/draft?brawler=Mr.+P");
    expect(enderecoDoDraft(null)).toBe("/draft");
  });
});
