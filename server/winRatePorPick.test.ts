import { describe, expect, it } from "vitest";
import {
  defaultDraftRuleSettings,
  getWinRatePickWeight,
  normalizeDraftRuleSettings,
  winRatePickKeys,
} from "@shared/draftRules";
import { calculateHybridScoresByMap } from "@shared/hybridScore";

describe("repartição vitória/uso por pick", () => {
  it("aumenta a fatia da vitória de 70% para 95% sem confundir o peso global do mapa", () => {
    const pesos = [1, 2, 3, 4, 5, 6].map((pick) => getWinRatePickWeight(pick, defaultDraftRuleSettings));
    expect(pesos).toEqual([0.7, 0.75, 0.8, 0.85, 0.9, 0.95]);
  });

  it("fora do intervalo vale o primeiro pick", () => {
    // Antes de o draft começar, o que está à frente é a situação do pick 1.
    for (const fora of [undefined, 0, 7, -3, Number.NaN]) {
      expect(getWinRatePickWeight(fora, defaultDraftRuleSettings)).toBe(defaultDraftRuleSettings.winRatePick1);
    }
  });

  it("um valor inválido gravado não contamina o motor", () => {
    const regras = normalizeDraftRuleSettings({ winRatePick3: 5, winRatePick4: -1 } as never);
    // `normalizeRate` prende ao intervalo 0–1: nunca sai daqui um peso que
    // tornasse o Score negativo ou acima de 100.
    expect(regras.winRatePick3).toBe(1);
    expect(regras.winRatePick4).toBe(0);
  });

  it("todas as chaves da escada existem nas regras", () => {
    for (const key of winRatePickKeys) expect(typeof defaultDraftRuleSettings[key]).toBe("number");
    expect(winRatePickKeys).toHaveLength(6);
  });

  /**
   * O que dá sentido à funcionalidade: a escada tem de MUDAR a ordem.
   *
   * O cenário precisa de quatro linhas, e não de duas. A normalização é
   * min–max dentro do mapa: com dois brawlers, um fica sempre a 100 e o outro
   * a 0 em cada métrica, e a comparação reduz-se a qual dos dois PESOS é
   * maior. Como a vitória nunca desce de 50% nesta escada, o mais usado nunca
   * ganharia — e o teste passaria a dizer o contrário do que quer verificar.
   *
   * Com um piso e um teto a fixar a escala, os dois do meio ficam onde
   * interessa: o "Equilibrado" ganha um pouco menos mas é bastante mais usado.
   * No primeiro pick o uso vale 30%; no sexto vale 5%, dando mais espaço
   * à vitória própria no mapa dentro da base.
   */
  it("muda a ordem entre o primeiro e o último pick", () => {
    const linhas = [
      { map: "Teste", brawler: "Piso", winRate: 0, usage: 0 },
      { map: "Teste", brawler: "Teto", winRate: 100, usage: 100 },
      { map: "Teste", brawler: "Vencedor", winRate: 60, usage: 40 },
      { map: "Teste", brawler: "Equilibrado", winRate: 55, usage: 70 },
    ];
    const pontuar = (pick: number) => {
      const peso = getWinRatePickWeight(pick, defaultDraftRuleSettings);
      return Object.fromEntries(
        calculateHybridScoresByMap(linhas, peso).map((linha) => [linha.brawler, linha.score ?? 0]),
      );
    };

    const primeiro = pontuar(1);
    const ultimo = pontuar(6);

    expect(primeiro.Equilibrado).toBeGreaterThan(primeiro.Vencedor);
    expect(ultimo.Vencedor).toBeGreaterThan(ultimo.Equilibrado);
  });
});
