import { afterEach, describe, expect, it } from "vitest";
import { setCounterSyncSnapshot } from "../shared/counterSourceRelations";
import { atribuirDuelosPorCounter } from "../shared/draft";
import type { CounterSyncSnapshotPayload, SyncedCounterRelation } from "../shared/counterSyncSnapshot";

/**
 * Nomes inventados de propósito: com nomes reais, o catálogo completo do
 * BrawlScope responde por qualquer par que o teste não defina, e o resultado
 * deixava de depender só do que está escrito aqui.
 */
const ganha = (dono: string, adversario: string, pontos: number): SyncedCounterRelation => ({
  owner: dono,
  source: "brawlscope",
  // O delta publicado é a vantagem do ADVERSÁRIO; o dono ganhar é delta negativo.
  direction: pontos >= 0 ? "targets" : "counteredBy",
  attacker: pontos >= 0 ? dono : adversario,
  defender: pontos >= 0 ? adversario : dono,
  delta: -pontos,
  sourceUrl: "https://example.test",
});

function dados(relations: SyncedCounterRelation[]) {
  const state = { status: "success" as const, complete: true, fetchedAt: "2026-09-24", brawlers: [], relationCount: 0 };
  const payload: CounterSyncSnapshotPayload = { schemaVersion: 2, capturedAt: state.fetchedAt, sourceStates: { brawlscope: state, planet: state, prodigy: state, calculator: state }, relations, absenceStreaks: {} };
  setCounterSyncSnapshot(payload);
}
afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: false }));

const linha = (brawler: string) => ({ brawler, score: 60, tier: "A" as const });
const equipa = (...nomes: string[]) => nomes.map(linha);
const pares = (duelos: ReturnType<typeof atribuirDuelosPorCounter>) => duelos.map((d) => `${d.ally.brawler}>${d.enemy.brawler}`);

describe("quem joga contra quem na matriz 1v1", () => {
  it("o brawler vai para o adversário a quem mais ganha, seja qual for a posição (o caso Mortis)", () => {
    dados([ganha("Xmortis", "Xdyna", 8), ganha("Xmortis", "Xprimo", -5)]);
    const duelos = atribuirDuelosPorCounter(equipa("Xmortis"), equipa("Xprimo", "Xgus", "Xdyna"));
    expect(pares(duelos)).toEqual(["Xmortis>Xdyna"]);
    expect(duelos[0].score).toBeCloseTo(58, 6);
    expect(duelos[0].motivo).toContain("Xdyna é o adversário a quem Xmortis mais ganha");
  });

  it("um brawler deixa o seu melhor alvo a um colega quando a equipa soma mais assim", () => {
    // Um a um, A1 escolheria E1 (+10) e A2 ficava com E2 (-6): total +4.
    // Trocados, A1>E2 (+8) e A2>E1 (+9): total +17.
    dados([ganha("Xa1", "Xe1", 10), ganha("Xa1", "Xe2", 8), ganha("Xa2", "Xe1", 9), ganha("Xa2", "Xe2", -6)]);
    const duelos = atribuirDuelosPorCounter(equipa("Xa1", "Xa2"), equipa("Xe1", "Xe2"));
    expect(pares(duelos)).toEqual(["Xa1>Xe2", "Xa2>Xe1"]);
    expect(duelos[0].motivo).toBe("Xa1 ganharia mais a Xe1, mas fica com Xe2 para Xa2 jogar contra Xe1: a equipa soma mais assim.");
    expect(duelos[1].motivo).toContain("Xe1 é o adversário a quem Xa2 mais ganha");
  });

  it("com o total empatado, não sacrifica ninguém: fica o pior duelo menos mau", () => {
    // As duas combinações somam +10; só uma deixa alguém a 0.
    dados([ganha("Xa1", "Xe1", 10), ganha("Xa1", "Xe2", 5), ganha("Xa2", "Xe1", 5)]);
    expect(pares(atribuirDuelosPorCounter(equipa("Xa1", "Xa2"), equipa("Xe1", "Xe2")))).toEqual(["Xa1>Xe2", "Xa2>Xe1"]);
  });

  it("na perspetiva Vermelha otimiza para a Vermelha, não para a Azul", () => {
    dados([ganha("Xa1", "Xe1", 10), ganha("Xa1", "Xe2", 8), ganha("Xa2", "Xe1", 9), ganha("Xa2", "Xe2", -6)]);
    const azul = pares(atribuirDuelosPorCounter(equipa("Xa1", "Xa2"), equipa("Xe1", "Xe2"), "ally"));
    const vermelha = atribuirDuelosPorCounter(equipa("Xa1", "Xa2"), equipa("Xe1", "Xe2"), "enemy");
    // Para a Vermelha o melhor é Xe2 contra Xa2 (+6 para ela) e Xe1 contra Xa1.
    expect(pares(vermelha)).toEqual(["Xa1>Xe1", "Xa2>Xe2"]);
    expect(pares(vermelha)).not.toEqual(azul);
    expect(vermelha[1].motivo).toContain("Xa2 é o adversário a quem Xe2 mais ganha");
  });

  it("com equipas de tamanhos diferentes, cada um recebe um adversário diferente", () => {
    dados([ganha("Xa1", "Xe3", 7), ganha("Xa2", "Xe3", 9), ganha("Xa2", "Xe1", 6)]);
    const duelos = atribuirDuelosPorCounter(equipa("Xa1", "Xa2"), equipa("Xe1", "Xe2", "Xe3"));
    expect(pares(duelos)).toEqual(["Xa1>Xe3", "Xa2>Xe1"]);
    expect(new Set(duelos.map((d) => d.enemy.brawler)).size).toBe(duelos.length);
    // E o contrário: mais aliados do que adversários.
    const invertido = atribuirDuelosPorCounter(equipa("Xa1", "Xa2", "Xa3"), equipa("Xe3"));
    expect(pares(invertido)).toEqual(["Xa2>Xe3"]);
  });

  it("sem picks de um dos lados não há duelos", () => {
    expect(atribuirDuelosPorCounter(equipa("Xa1"), [])).toEqual([]);
    expect(atribuirDuelosPorCounter([], equipa("Xe1"))).toEqual([]);
  });

  it("escolhe sempre a combinação de soma máxima (comparado com força bruta em 200 casos)", () => {
    let semente = 7;
    const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let caso = 0; caso < 200; caso++) {
      const aliados = ["Xa1", "Xa2", "Xa3"], inimigos = ["Xe1", "Xe2", "Xe3"];
      const valor: Record<string, number> = {};
      const relacoes: SyncedCounterRelation[] = [];
      for (const a of aliados) for (const e of inimigos) {
        const v = Math.round((aleatorio() * 24 - 12) * 10) / 10;
        valor[`${a}>${e}`] = v === 0 ? 0 : v;
        if (v !== 0) relacoes.push(ganha(a, e, v));
      }
      dados(relacoes);
      const duelos = atribuirDuelosPorCounter(equipa(...aliados), equipa(...inimigos));
      const soma = duelos.reduce((s, d) => s + d.score - 50, 0);
      const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
      const melhor = Math.max(...perms.map((p) => p.reduce((s, e, a) => s + valor[`${aliados[a]}>${inimigos[e]}`], 0)));
      expect(soma).toBeCloseTo(melhor, 6);
    }
  });
});
