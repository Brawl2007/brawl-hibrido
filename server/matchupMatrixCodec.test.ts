import { describe, expect, it } from "vitest";
import {
  countEncodedPairs,
  decodeMatchupMatrices,
  encodeMatchupMatrices,
  type MatchupMatrices,
} from "@shared/matchupMatrixCodec";
import { brawlScopeMatchupDeltas } from "@shared/brawlScopeMatchupDeltas.generated";

describe("formato compacto das matrizes por modo", () => {
  const exemplo: MatchupMatrices = {
    knockout: {
      "8-Bit": { "Larry & Lawrie": 4.7, "Pam": 14.7, "Fang": -10.8, "Surge": 0 },
      "Alli": { "Kaze": -22, "Darryl": 26.9 },
    },
    heist: {
      "8-Bit": { "Pam": 3.1 },
    },
  };

  it("devolve exatamente os mesmos valores depois de ida e volta", () => {
    expect(decodeMatchupMatrices(encodeMatchupMatrices(exemplo))).toEqual(exemplo);
  });

  it("preserva a casa decimal sem ruído de vírgula flutuante", () => {
    // O caminho ingénuo (dividir por 10) produzia coisas como 0.30000000000000004.
    const delicado: MatchupMatrices = {
      knockout: { "A": { "B": 0.3, "C": -0.1, "D": 2.9, "E": -9.7, "F": 12.8 } },
    };
    const voltou = decodeMatchupMatrices(encodeMatchupMatrices(delicado));

    expect(voltou.knockout.A).toEqual({ B: 0.3, C: -0.1, D: 2.9, E: -9.7, F: 12.8 });
    for (const valor of Object.values(voltou.knockout.A)) {
      expect(String(valor).replace("-", "").split(".")[1]?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it("mantém nomes com & e hífen intactos", () => {
    const voltou = decodeMatchupMatrices(encodeMatchupMatrices(exemplo));
    expect(Object.keys(voltou.knockout["8-Bit"])).toContain("Larry & Lawrie");
    expect(Object.keys(voltou.knockout)).toContain("8-Bit");
  });

  it("guarda cada nome uma só vez", () => {
    const codificado = encodeMatchupMatrices(exemplo);
    expect(new Set(codificado.names).size).toBe(codificado.names.length);
    // "8-Bit" e "Pam" aparecem nas duas vistas e mesmo assim só entram uma vez.
    expect(codificado.names.filter((name) => name === "Pam")).toHaveLength(1);
  });

  it("encolhe a matriz real para uma fração do JSON literal", () => {
    /**
     * O teste que justifica todo o módulo. A matriz geral completa serve de
     * amostra realista: ~105 fichas com ~100 adversários cada.
     */
    const real: MatchupMatrices = {
      overall: Object.fromEntries(Object.entries(brawlScopeMatchupDeltas).map(([name, profile]) => [name, profile.deltas])),
    };
    const literal = JSON.stringify(real).length;
    const compacto = JSON.stringify(encodeMatchupMatrices(real)).length;

    expect(compacto).toBeLessThan(literal * 0.35);
    // E continua a ser exatamente a mesma informação.
    expect(decodeMatchupMatrices(encodeMatchupMatrices(real))).toEqual(real);
  });

  it("conta os pares sem descodificar tudo", () => {
    const codificado = encodeMatchupMatrices(exemplo);
    expect(countEncodedPairs(codificado)).toBe(4 + 2 + 1);
    expect(countEncodedPairs(null)).toBe(0);
  });

  it("descarta valores que não são números em vez de os guardar", () => {
    const sujo = { knockout: { "A": { "B": Number.NaN, "C": Infinity, "D": 1.2 } } } as unknown as MatchupMatrices;
    expect(decodeMatchupMatrices(encodeMatchupMatrices(sujo))).toEqual({ knockout: { A: { D: 1.2 } } });
  });

  it("não guarda fichas nem vistas vazias", () => {
    const codificado = encodeMatchupMatrices({ knockout: { "A": {} }, heist: {} });
    expect(codificado.views).toEqual({});
  });

  it("devolve vazio perante lixo, em vez de arrancar com números errados", () => {
    for (const entrada of [null, undefined, 42, "texto", {}, { v: 99, names: [], views: {} }, { v: 1, names: "x", views: {} }]) {
      expect(decodeMatchupMatrices(entrada)).toEqual({});
    }
  });

  it("ignora entradas corrompidas sem perder as boas da mesma vista", () => {
    const codificado = encodeMatchupMatrices(exemplo);
    // Índice de nome fora do dicionário e par sem separador.
    codificado.views.knockout["999"] = "0:15";
    codificado.views.knockout["0"] = `${codificado.views.knockout["0"]},lixo,7`;

    const voltou = decodeMatchupMatrices(codificado);
    expect(Object.keys(voltou.knockout)).toEqual(["8-Bit", "Alli"]);
    expect(voltou.knockout["8-Bit"]["Pam"]).toBe(14.7);
  });

  it("guarda o momento da recolha quando lhe é dado", () => {
    expect(encodeMatchupMatrices(exemplo, "2026-09-11T10:00:00.000Z").capturedAt).toBe("2026-09-11T10:00:00.000Z");
    expect(encodeMatchupMatrices(exemplo).capturedAt).toBeUndefined();
  });
});
