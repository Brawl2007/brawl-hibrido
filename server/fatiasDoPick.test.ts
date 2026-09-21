import { describe, expect, it } from "vitest";
import { fatiasDoPick, pesosDoPickAPartirDasFatias } from "../client/src/lib/draftRules";

/**
 * A tradução entre as duas escalas dos pesos de um pick.
 *
 * O motor guarda `winRatePickN` como a divisão Vitória/Uso do que SOBRA depois
 * do Star Player. O painel mostra três percentagens do TOTAL, que somam 100.
 * Duas escalas para a mesma coisa é um convite ao erro — e o erro já aconteceu:
 * o atalho "Todos a 50/30/20" gravava 50 na escala errada e entregava
 * 35/30/35, um botão a prometer uma divisão e a aplicar outra.
 *
 * Estes testes fecham essa porta: o que se escreve é o que sai, e o que sai
 * volta a entrar igual.
 */

describe("as três fatias de um pick", () => {
  it("com o Star Player desligado, a vitória é a fatia do total, como sempre foi", () => {
    expect(fatiasDoPick(70, 30, false)).toEqual({ vitoria: 70, star: 0, uso: 30 });
    expect(fatiasDoPick(95, 99, false)).toEqual({ vitoria: 95, star: 0, uso: 5 });
  });

  it("com o Star Player ligado, a vitória e o uso repartem o que sobra", () => {
    // 70% de vitória sobre os 70 que sobram = 49; o uso fica com 21.
    expect(fatiasDoPick(70, 30, true)).toEqual({ vitoria: 49, star: 30, uso: 21 });
    expect(fatiasDoPick(95, 10, true)).toEqual({ vitoria: 86, star: 10, uso: 4 });
  });

  it("as três somam sempre 100 — não 99 nem 101", () => {
    for (let win = 0; win <= 100; win += 1) {
      for (const star of [0, 1, 7, 30, 50, 73, 99, 100]) {
        const f = fatiasDoPick(win, star, true);
        expect(f.vitoria + f.star + f.uso, `win ${win} star ${star}`).toBe(100);
        expect(f.vitoria).toBeGreaterThanOrEqual(0);
        expect(f.uso).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("escrever uma divisão e voltar a lê-la dá o mesmo número", () => {
    // Este é o teste que o atalho partido teria falhado.
    for (const [vitoria, star] of [[50, 30], [20, 30], [65, 5], [0, 40], [100, 0], [43, 57]]) {
      const pesos = pesosDoPickAPartirDasFatias(vitoria, star, 70);
      const lido = fatiasDoPick(pesos.winRate, pesos.starPlayer, true);
      expect(lido.vitoria, `${vitoria}/${star}`).toBe(vitoria);
      expect(lido.star, `${vitoria}/${star}`).toBe(star);
      expect(lido.uso, `${vitoria}/${star}`).toBe(100 - vitoria - star);
    }
  });

  it("escrever o USO é o mesmo que escrever a vitória do avesso", () => {
    // É assim que o campo do uso grava: pede o resto disponível menos o uso.
    const star = 30;
    const disponivel = 100 - star;
    for (const uso of [0, 5, 20, 35, 70]) {
      const pesos = pesosDoPickAPartirDasFatias(disponivel - uso, star, 70);
      expect(fatiasDoPick(pesos.winRate, pesos.starPlayer, true).uso, `uso ${uso}`).toBe(uso);
    }
  });

  it("uma vitória maior do que o espaço livre é cortada, não estraga a soma", () => {
    const pesos = pesosDoPickAPartirDasFatias(90, 50, 70);
    const f = fatiasDoPick(pesos.winRate, pesos.starPlayer, true);
    expect(f).toEqual({ vitoria: 50, star: 50, uso: 0 });
  });

  it("com o Star Player a 100% não se perde a divisão anterior", () => {
    // Não sobra nada para repartir, e dividir por zero daria NaN. A divisão de
    // antes fica guardada à espera de voltar a ter espaço.
    const pesos = pesosDoPickAPartirDasFatias(0, 100, 85);
    expect(pesos.winRate).toBe(85);
    expect(Number.isFinite(pesos.winRate)).toBe(true);
    expect(fatiasDoPick(pesos.winRate, pesos.starPlayer, true)).toEqual({ vitoria: 0, star: 100, uso: 0 });
    // E ao voltar a abrir espaço, os 85/15 estão lá.
    expect(fatiasDoPick(pesos.winRate, 0, true)).toEqual({ vitoria: 85, star: 0, uso: 15 });
  });

  it("mexer no Star Player mantém a proporção entre vitória e uso", () => {
    // 40/30 é uma proporção de 4:3. Com o Star Player a subir, os dois encolhem
    // juntos — quem escolheu a divisão não a vê desfeita pelas costas.
    const pesos = pesosDoPickAPartirDasFatias(40, 30, 70);
    const comMaisStar = fatiasDoPick(pesos.winRate, 50, true);
    expect(comMaisStar).toEqual({ vitoria: 29, star: 50, uso: 21 });
    expect(comMaisStar.vitoria / comMaisStar.uso).toBeCloseTo(40 / 30, 1);
  });

  it("valores impossíveis não produzem NaN", () => {
    for (const [v, st] of [[-10, 30], [200, 30], [50, -5], [50, 300]]) {
      const pesos = pesosDoPickAPartirDasFatias(v, st, 70);
      expect(Number.isFinite(pesos.winRate), `${v}/${st}`).toBe(true);
      expect(Number.isFinite(pesos.starPlayer), `${v}/${st}`).toBe(true);
      const f = fatiasDoPick(pesos.winRate, pesos.starPlayer, true);
      expect(f.vitoria + f.star + f.uso).toBe(100);
    }
  });
});
