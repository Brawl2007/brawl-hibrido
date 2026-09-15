import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getBrawlScopeReading,
  getMatchupValue,
  setBrawlScopeReading,
} from "@shared/counterMatchupValue";
import { brawlScopeModeCoverage } from "@shared/brawlScopeMatchupsByMode.generated";
import { describeMatchupScope, describeMatchupValue } from "@shared/counterMatchupValue";
import { DEFAULT_BRAWLSCOPE_READING, normalizeBrawlScopeReading } from "@shared/brawlScopeReading";
import { setCounterSyncSnapshot } from "@shared/counterSourceRelations";

beforeEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));
afterEach(() => {
  setCounterSyncSnapshot(undefined, { allowOfflineFallback: false });
  setBrawlScopeReading(DEFAULT_BRAWLSCOPE_READING);
});

describe("leitura geral ou por modo", () => {
  it("aceita apenas as duas leituras conhecidas", () => {
    expect(normalizeBrawlScopeReading("overall")).toBe("overall");
    expect(normalizeBrawlScopeReading("byMode")).toBe("byMode");
    expect(normalizeBrawlScopeReading("inventada")).toBe(DEFAULT_BRAWLSCOPE_READING);

    setBrawlScopeReading("overall");
    expect(getBrawlScopeReading()).toBe("overall");
  });

  it("usa a tabela do modo quando ela existe e o geral quando não existe", () => {
    // Nocaute tem a ficha de 8-Bit recolhida: Pam aparece lá com +14.7 publicado,
    // enquanto a leitura geral do mesmo par dá vantagem ligeira ao 8-Bit.
    setBrawlScopeReading("overall");
    const geral = getMatchupValue("8-Bit", "Pam", "knockout").total;

    setBrawlScopeReading("byMode");
    const porModo = getMatchupValue("8-Bit", "Pam", "knockout").total;

    expect(geral).toBeGreaterThan(0);
    expect(porModo).toBeLessThan(0);
    expect(porModo).not.toBe(geral);
  });

  it("mantém o valor geral para um modo ainda sem recolha", () => {
    setBrawlScopeReading("overall");
    const geral = getMatchupValue("8-Bit", "Pam", "gemGrab").total;

    setBrawlScopeReading("byMode");
    expect(getMatchupValue("8-Bit", "Pam", "gemGrab").total).toBe(geral);
    expect(getMatchupValue("8-Bit", "Pam").total).toBe(geral);
  });

  it("declara a cobertura recolhida de cada modo", () => {
    const cobertura = brawlScopeModeCoverage();

    expect(Object.keys(cobertura).sort()).toEqual(["bounty", "brawlBall", "gemGrab", "heist", "hotZone", "knockout"]);
    expect(cobertura.knockout).toBeGreaterThan(0);
  });
});

describe("origem visível de cada valor de confronto", () => {
  /**
   * Nasceu de uma queixa concreta: alternar entre "Geral" e "Por modo" parecia
   * não fazer nada. A leitura estava certa — o que faltava era a tabela por modo
   * ter dados. Sem dizer de onde veio cada número, a explicação verdadeira ficava
   * invisível e o comportamento certo parecia uma avaria.
   */
  it("identifica a tabela do modo quando ela publica o par", () => {
    setBrawlScopeReading("byMode");
    const valor = getMatchupValue("Amber", "Pam", "knockout");

    expect(valor.scope).toBe("knockout");
    expect(describeMatchupScope(valor)).toContain("Nocaute");
    expect(describeMatchupValue(valor)).toContain("(Nocaute)");
  });

  it("diz claramente quando caiu para a tabela geral", () => {
    setBrawlScopeReading("byMode");
    // Um par que a tabela de Nocaute não publica: o valor é legítimo, mas geral.
    const valor = getMatchupValue("Brock", "Bea", "knockout");

    expect(valor.scope).toBe("overall");
    expect(describeMatchupScope(valor)).toBe("tabela geral");
    expect(describeMatchupValue(valor)).toContain("(tabela geral)");
  });

  it("com a leitura geral, tudo vem da tabela geral mesmo havendo dados do modo", () => {
    setBrawlScopeReading("overall");
    const valor = getMatchupValue("Amber", "Pam", "knockout");

    expect(valor.scope).toBe("overall");
    expect(describeMatchupValue(valor)).toContain("(tabela geral)");
  });

  it("o valor muda mesmo entre as duas leituras, onde há dados do modo", () => {
    setBrawlScopeReading("overall");
    const geral = getMatchupValue("Amber", "Pam", "knockout").total;
    setBrawlScopeReading("byMode");
    const porModo = getMatchupValue("Amber", "Pam", "knockout").total;

    expect(porModo).not.toBe(geral);
  });

  it("não inventa origem quando a fonte não publica o par", () => {
    setBrawlScopeReading("byMode");
    const valor = getMatchupValue("Amber", "Amber", "knockout");

    expect(valor.base).toBeNull();
    expect(describeMatchupScope(valor)).toBeNull();
  });
});
