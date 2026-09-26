import { describe, expect, it } from "vitest";
import {
  defaultDraftRuleSettings,
  getStarPlayerPickWeight,
  getWinRatePickWeight,
  normalizeDraftRuleSettings,
  starPlayerPickKeys,
  winRatePickKeys,
} from "@shared/draftRules";
import { calculateHybridScoreForWinRateWeight, calculateHybridScoresByMap } from "@shared/hybridScore";

/**
 * A escada do Star Player por pick.
 *
 * O Score já repartia Vitória/Uso pick a pick. Esta escada acrescenta a
 * terceira fatia à mesma lógica: seis valores, um por pick.
 *
 * AS DUAS COISAS QUE TÊM DE SER VERDADE
 *
 *  1. A fatia escrita é a fatia que sai. `starPlayerPickN` é percentagem do
 *     TOTAL, ao contrário de `winRatePickN`, que divide o que sobra. Se as
 *     duas leituras se trocarem, alguém escreve 30 e recebe 21 sem perceber
 *     porquê.
 *  2. Com o interruptor global desligado, a escada não conta. Quem a decide
 *     aplicar é o Draft, não este módulo — mas o Score tem de continuar a ser
 *     o de sempre quando a fatia chega a zero, senão a métrica opcional deixou
 *     de ser opcional.
 */

describe("a escada do Star Player por pick", () => {
  it("entra plana, com a mesma fatia que o painel do Score oferece", () => {
    expect(starPlayerPickKeys.map((key) => defaultDraftRuleSettings[key])).toEqual([0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
    // Plana de propósito: inclinar o Star Player ao longo do draft é uma
    // opinião que ninguém mediu, e não é para vir de fábrica.
    expect(new Set(starPlayerPickKeys.map((key) => defaultDraftRuleSettings[key])).size).toBe(1);
  });

  it("devolve a fatia do pick pedido, e a do pick 1 fora do intervalo", () => {
    const escada = normalizeDraftRuleSettings({
      starPlayerPick1: 0.1, starPlayerPick2: 0.2, starPlayerPick3: 0.3,
      starPlayerPick4: 0.4, starPlayerPick5: 0.5, starPlayerPick6: 0.6,
    });
    expect([1, 2, 3, 4, 5, 6].map((pick) => getStarPlayerPickWeight(pick, escada))).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    // Antes de o draft começar, o que está à frente é o primeiro pick.
    for (const foraDoIntervalo of [0, 7, -3, 99, undefined, Number.NaN]) {
      expect(getStarPlayerPickWeight(foraDoIntervalo, escada)).toBe(0.1);
    }
  });

  it("a fatia escrita é a fatia que o Score paga, pick a pick", () => {
    const escada = normalizeDraftRuleSettings({
      winRatePick1: 0.7, winRatePick6: 0.95,
      starPlayerPick1: 0.3, starPlayerPick6: 0.1,
    });

    // Pick 1: 30% de Star Player, e os 70 restantes divididos 70/30 → 49/30/21.
    const win1 = getWinRatePickWeight(1, escada);
    const star1 = getStarPlayerPickWeight(1, escada);
    expect(calculateHybridScoreForWinRateWeight(100, 0, win1, 0, star1)).toBeCloseTo(49, 10);
    expect(calculateHybridScoreForWinRateWeight(0, 0, win1, 100, star1)).toBeCloseTo(30, 10);
    expect(calculateHybridScoreForWinRateWeight(0, 100, win1, 0, star1)).toBeCloseTo(21, 10);

    // Pick 6: 10% de Star Player, e os 90 restantes divididos 95/5 → 85,5/10/4,5.
    const win6 = getWinRatePickWeight(6, escada);
    const star6 = getStarPlayerPickWeight(6, escada);
    expect(calculateHybridScoreForWinRateWeight(100, 0, win6, 0, star6)).toBeCloseTo(85.5, 10);
    expect(calculateHybridScoreForWinRateWeight(0, 0, win6, 100, star6)).toBeCloseTo(10, 10);
    expect(calculateHybridScoreForWinRateWeight(0, 100, win6, 0, star6)).toBeCloseTo(4.5, 10);
  });

  it("a escada do Star Player não mexe na repartição Vitória/Uso do que sobra", () => {
    /*
     * Sejam quais forem as fatias, a proporção entre vitória e uso dentro do
     * resto continua a ser a que a escada da vitória manda. Sem isto, mexer no
     * Star Player mudaria silenciosamente a leitura do pick.
     *
     * O Star Player entra a 0 nos dois lados de propósito: a sua parcela some,
     * e o que fica é só a divisão do resto. A primeira versão deste teste
     * passava 50 nos dois e falhava — com razão, porque estava a somar a mesma
     * parcela aos dois números e depois a dividi-los um pelo outro. Era a
     * pergunta que estava mal feita, não a resposta.
     */
    for (const star of [0, 0.1, 0.3, 0.6, 0.9]) {
      const soVitoria = calculateHybridScoreForWinRateWeight(100, 0, 0.7, 0, star)!;
      const soUso = calculateHybridScoreForWinRateWeight(0, 100, 0.7, 0, star)!;
      expect(soVitoria / soUso, `fatia ${star}`).toBeCloseTo(0.7 / 0.3, 8);
    }
  });

  it("dois picks com fatias diferentes ordenam os candidatos de maneira diferente", () => {
    const mapa = [
      { map: "Gem Fort", brawler: "Carregador", topBrawlWinRate: 50, brawlPlanetWinRate: 50, topBrawlUseRate: 10, brawlPlanetPickRate: 10, brawlPlanetStarPlayer: 30 },
      { map: "Gem Fort", brawler: "Apoio", topBrawlWinRate: 53, brawlPlanetWinRate: 53, topBrawlUseRate: 10, brawlPlanetPickRate: 10, brawlPlanetStarPlayer: 10 },
      { map: "Gem Fort", brawler: "Popular", topBrawlWinRate: 50, brawlPlanetWinRate: 50, topBrawlUseRate: 20, brawlPlanetPickRate: 20, brawlPlanetStarPlayer: 20 },
      { map: "Gem Fort", brawler: "Fraco", topBrawlWinRate: 45, brawlPlanetWinRate: 45, topBrawlUseRate: 5, brawlPlanetPickRate: 5, brawlPlanetStarPlayer: 5 },
    ];
    const escada = normalizeDraftRuleSettings({
      winRatePick1: 0.7, winRatePick6: 0.7,
      starPlayerPick1: 0.5, // pick 1: o Star Player manda
      starPlayerPick6: 0,   // pick 6: fora do Score
    });

    const melhorNoPick = (pick: number) => calculateHybridScoresByMap(
      mapa,
      getWinRatePickWeight(pick, escada),
      0.5,
      getStarPlayerPickWeight(pick, escada),
    ).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0].brawler;

    expect(melhorNoPick(1)).toBe("Carregador");
    expect(melhorNoPick(6)).toBe("Apoio");
  });

  it("com a fatia a zero, o Score é IDÊNTICO ao de antes de existir Star Player", () => {
    const mapa = [
      { map: "M", brawler: "A", topBrawlWinRate: 55, topBrawlUseRate: 12, brawlPlanetStarPlayer: 30 },
      { map: "M", brawler: "B", topBrawlWinRate: 48, topBrawlUseRate: 20, brawlPlanetStarPlayer: 5 },
      { map: "M", brawler: "C", topBrawlWinRate: 51, topBrawlUseRate: 8, brawlPlanetStarPlayer: 18 },
    ];
    for (const pick of [1, 2, 3, 4, 5, 6]) {
      const win = getWinRatePickWeight(pick, defaultDraftRuleSettings);
      const comEscadaAZero = calculateHybridScoresByMap(mapa, win, 0.5, 0);
      const semParametroNenhum = calculateHybridScoresByMap(mapa, win, 0.5);
      expect(comEscadaAZero).toEqual(semParametroNenhum);
    }
  });

  it("as preferências gravadas antes desta escada recebem o valor de fábrica, não zero", () => {
    // Uma preferência antiga não traz `starPlayerPickN`. Se a normalização
    // caísse em zero, quem já tinha regras personalizadas ficava com o Star
    // Player fora do Draft sem ter pedido nada.
    const antiga = normalizeDraftRuleSettings({ winRatePick1: 0.8, counterPick1: 0.07 });
    expect(starPlayerPickKeys.map((key) => antiga[key])).toEqual([0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
    expect(antiga.winRatePick1).toBe(0.8);
  });

  it("valores impossíveis são cortados para o intervalo 0–1", () => {
    const limpo = normalizeDraftRuleSettings({
      starPlayerPick1: 5, starPlayerPick2: -2, starPlayerPick3: Number.NaN, starPlayerPick4: Infinity,
    } as never);
    expect(limpo.starPlayerPick1).toBe(1);
    expect(limpo.starPlayerPick2).toBe(0);
    // Não-números caem no valor de fábrica, como todas as outras regras.
    expect(limpo.starPlayerPick3).toBe(0.3);
    expect(limpo.starPlayerPick4).toBe(0.3);
  });

  it("as duas escadas têm seis degraus e não se sobrepõem", () => {
    expect(starPlayerPickKeys).toHaveLength(6);
    expect(winRatePickKeys).toHaveLength(6);
    expect(starPlayerPickKeys.some((key) => (winRatePickKeys as readonly string[]).includes(key))).toBe(false);
  });
});
