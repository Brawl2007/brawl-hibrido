import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { setCounterSyncSnapshot } from "../shared/counterSourceRelations";
import { atribuirDuelosPorCounter, leituraDoPLProdigy, posicionarNoMapa, type PosicaoNoMapa } from "../shared/draft";
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

describe("a matriz 1v1 segue a perspetiva escolhida", () => {
  const fonte = readFileSync(new URL("../client/src/pages/Draft.tsx", import.meta.url), "utf8");
  it("na perspetiva Vermelha, a Vermelha passa para o lado esquerdo e é otimizada como a tua equipa", () => {
    expect(fonte).toContain('const blueRows = myTeam === "red" ? linhasVermelha : linhasAzul;');
    expect(fonte).toContain('const redRows = myTeam === "red" ? linhasAzul : linhasVermelha;');
    expect(fonte).toContain('atribuirDuelosPorCounter(blueRows, redRows, "ally")');
    expect(fonte).toMatch(/<LaneMatchupDesk myTeam=\{myTeam\}/);
  });
  it("os nomes das equipas no painel não estão escritos à mão", () => {
    const inicio = fonte.indexOf("function MatchupDuelCard(");
    const fim = fonte.indexOf("function FinalWinProbability(");
    const painel = fonte.slice(inicio, fim).replace(/\/\/.*$/gm, "");
    expect(painel).not.toMatch(/>(AZUL|VERMELHA)[ <]|"(AZUL|VERMELHA)"|label="(AZUL|VERMELHA)"/);
  });
});

describe("o botão de perspetiva cabe na coluna do draft", () => {
  it("a barra de progresso não usa três colunas fixas dentro da coluna estreita do draft", () => {
    // Entre 1280 e 1600px a coluna tem 418–519px e as três colunas pediam 577px:
    // "Perspetiva: Vermelha" ficava cortado fora da caixa.
    const css = readFileSync(new URL("../client/src/arena-v55.css", import.meta.url), "utf8");
    expect(css).toContain(".draft-shell .draft-arena .draft-progress { grid-template-columns: minmax(0, 1fr) auto; }");
    expect(css).toContain(".draft-shell .draft-arena .draft-progress-actions { grid-column: 1 / -1;");
  });
});

describe("em que coluna do mapa fica cada brawler", () => {
  const funcoes: Record<string, "mid" | "side" | "flex"> = { M1: "mid", M2: "mid", S1: "side", S2: "side", S3: "side", F1: "flex" };
  const colocar = (nomes: string[], ocupadas?: Set<PosicaoNoMapa>) =>
    Object.fromEntries(posicionarNoMapa(nomes, (n) => funcoes[n], ocupadas).map(({ position, item }) => [position, item]));

  it("Mid ao meio e Lanes nas pontas, seja qual for a ordem das escolhas", () => {
    expect(colocar(["S1", "M1", "S2"])).toEqual({ left: "S1", mid: "M1", right: "S2" });
    expect(colocar(["M1", "S2", "S1"])).toEqual({ left: "S2", mid: "M1", right: "S1" });
  });
  it("um brawler de Mid sozinho fica no meio, e não na lane esquerda", () => {
    expect(colocar(["M1"])).toEqual({ mid: "M1" });
  });
  it("um de Lane sozinho fica numa ponta; um Flex sozinho fica no meio", () => {
    expect(colocar(["S1"])).toEqual({ left: "S1" });
    expect(colocar(["F1"])).toEqual({ mid: "F1" });
  });
  it("o que sobra ocupa o primeiro lugar livre", () => {
    expect(colocar(["S1", "S2", "S3"])).toEqual({ left: "S1", mid: "S3", right: "S2" });
    expect(colocar(["M1", "M2", "F1"])).toEqual({ left: "M2", mid: "M1", right: "F1" });
  });
  it("respeita as colunas já ocupadas pelos duelos", () => {
    expect(colocar(["M1", "S1"], new Set<PosicaoNoMapa>(["mid"]))).toEqual({ left: "S1", right: "M1" });
    expect(colocar(["S1"], new Set<PosicaoNoMapa>(["left", "mid", "right"]))).toEqual({});
  });
});

describe("o mapa dos duelos no Draft", () => {
  const fonte = readFileSync(new URL("../client/src/pages/Draft.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
  const mapa = fonte.slice(fonte.indexOf("function MapaDosDuelos("), fonte.indexOf("const LaneMatchupDesk = memo("));

  it("o adversário fica em cima e a tua equipa em baixo, em cada coluna", () => {
    const cima = mapa.indexOf('<FichaNoMapa row={coluna.enemy} lado="enemy" />');
    const linha = mapa.indexOf('className="duel-map-link"');
    const baixo = mapa.indexOf('<FichaNoMapa row={coluna.ally} lado="ally" />');
    expect(cima).toBeGreaterThan(0);
    expect(cima).toBeLessThan(linha);
    expect(linha).toBeLessThan(baixo);
  });
  it("usa o layout real do mapa escolhido, com o relvado em CSS por baixo", () => {
    expect(fonte).toContain("mapImage={selectedMap ? mapImageFor(selectedMap) : null}");
    expect(css).toMatch(/var\(--duel-map-image, none\) center \/ cover no-repeat/);
    expect(css).toContain("aspect-ratio: 21 / 33;");
  });
  it("as colunas do mapa vêm da mesma atribuição por counters que a lista", () => {
    expect(fonte).toContain("const duelos = atribuirDuelosPorCounter(blueRows, redRows, \"ally\");");
    expect(fonte).toContain("<MapaDosDuelos colunas={colunasDoMapa}");
  });
});

describe("aba PL Prodigy do mapa", () => {
  const prodigy = (dono: string, direcao: "targets" | "counteredBy", outro: string): SyncedCounterRelation => ({
    owner: dono, source: "prodigy", direction: direcao,
    attacker: direcao === "targets" ? dono : outro, defender: direcao === "targets" ? outro : dono,
    sourceUrl: `https://powerleagueprodigy.com/${dono.toLowerCase()}`,
  });

  it("ganha se a guia do próprio o diz, ou se a do adversário diz que perde com ele", () => {
    dados([prodigy("Xa1", "targets", "Xe1"), prodigy("Xe2", "counteredBy", "Xa1")]);
    expect(leituraDoPLProdigy("Xa1", "Xe1")).toBe(1);
    expect(leituraDoPLProdigy("Xa1", "Xe2")).toBe(1); // o caso Bibi/Juju: vem da guia da Juju
  });
  it("perde pelo mesmo critério ao contrário, e fica neutro sem nada publicado ou em contradição", () => {
    dados([prodigy("Xa1", "counteredBy", "Xe1"), prodigy("Xe2", "targets", "Xa1"), prodigy("Xa1", "targets", "Xe3"), prodigy("Xe3", "targets", "Xa1")]);
    expect(leituraDoPLProdigy("Xa1", "Xe1")).toBe(-1);
    expect(leituraDoPLProdigy("Xa1", "Xe2")).toBe(-1);
    expect(leituraDoPLProdigy("Xa1", "Xe3")).toBe(0);
    expect(leituraDoPLProdigy("Xa1", "Xe9")).toBe(0);
  });
  it("ignora as outras fontes: um counter do BrawlScope não conta na aba PL Prodigy", () => {
    dados([ganha("Xa1", "Xe1", 12)]);
    expect(leituraDoPLProdigy("Xa1", "Xe1")).toBe(0);
  });
  it("os pares da aba vêm da leitura do PL Prodigy", () => {
    dados([prodigy("Xa1", "targets", "Xe2"), prodigy("Xa2", "targets", "Xe1")]);
    const duelos = atribuirDuelosPorCounter(equipa("Xa1", "Xa2"), equipa("Xe1", "Xe2"), "ally", (a, e) => 50 + 10 * leituraDoPLProdigy(a.brawler, e.brawler));
    expect(pares(duelos)).toEqual(["Xa1>Xe2", "Xa2>Xe1"]);
  });
  it("o painel tem as duas abas e a do PL Prodigy usa essa leitura", () => {
    const fonte = readFileSync(new URL("../client/src/pages/Draft.tsx", import.meta.url), "utf8");
    expect(fonte).toContain('onClick={() => setLeitura("prodigy")}');
    expect(fonte).toContain("50 + 10 * leituraDoPLProdigy(ally.brawler, enemy.brawler)");
  });
});
