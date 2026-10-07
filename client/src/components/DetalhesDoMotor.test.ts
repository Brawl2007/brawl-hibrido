import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DetalhesDoMotor } from "./DetalhesDoMotor";

describe("unidades nos detalhes do motor escolhido", () => {
  it("distingue a soma ponderada do PL, a diferença medida em pp e os pontos finais", () => {
    const html = renderToStaticMarkup(createElement(DetalhesDoMotor, {
      motor: {
        nome: "plprodigy",
        partes: [{ nome: "Counter", valor: 40 }, { nome: "Vitória", valor: 20 }],
        contexto: {
          counters: [{ brawler: "Doug", pp: 6.2 }], sinergias: [], countersBanidos: [], riscos: [], inimigosPorRevelar: 0,
        },
      },
      pontos: 82.72, expanded: true,
    }));
    expect(html).toContain("Soma ponderada 60.0% → 82.72 pts");
    expect(html).toContain("+40.0 % da soma");
    expect(html).toContain("Doug +6.2 pp");
    expect(html).toContain("desligado — os três inimigos já estão revelados");
    expect(html).not.toContain("+40.0 pts");
  });

  it("os fatores do Meta são pontos somáveis, com risco negativo", () => {
    const html = renderToStaticMarkup(createElement(DetalhesDoMotor, {
      motor: { nome: "metapick", partes: [{ nome: "Base", valor: 70 }, { nome: "Counter", valor: 25 }, { nome: "Risco", valor: -4 }] },
      pontos: 91, expanded: false,
    }));
    expect(html).toContain("Total 91.00 pts");
    expect(html).toContain("−4.0 pts");
    expect(html).not.toContain("% da soma");
  });
});
