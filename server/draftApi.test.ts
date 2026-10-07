import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { confrontoObservadoComJogos, definirFonteObservada, montarFonteObservada, sinergiaObservadaComJogos } from "@shared/counterMatchupValue";
import { avaliarParDaApi, calculateDraftSignal, rankDraftEntries } from "@shared/draft";
import { motivoDoPar, paresDaDica } from "../client/src/lib/paresDaDica";
import { defaultDraftApiRuleSettings, defaultDraftRuleSettings, getCounterPickMultiplier, normalizarRegrasDaApi } from "@shared/draftRules";

/*
 * v170 — o Draft com «API oficial» tem regras próprias:
 *  - um par (confronto ou dupla) só conta com 20 jogos ou mais neste mapa;
 *  - counter e sinergia com a MESMA lógica: 55% ou mais e acima do normal dele
 *    soma; 45% ou menos e abaixo do normal tira (counterado, anti-sinergia);
 *  - os pontos são SOMADOS (a diferença × o peso), não uma % da base;
 *  - o counter banido e a pressão por aliado usam os confrontos da API.
 * Com a API desligada, nada disto mexe no Draft das fontes.
 */

afterEach(() => definirFonteObservada(null));

const linha = (brawler: string, score = 70) => ({ brawler, score, tier: "A" as const, winRate: 50 });

/**
 * A Nita ganha 53% no mapa (53 de 100). Pares com a vitória encolhida pelos
 * jogos — (vitórias + 10 × 0,53) / (jogos + 10):
 *  - contra o Bull: 18 de 30 → 58,3% (+5,25)        conta
 *  - contra o Rico: 6 de 8 → 62,8%                  poucos jogos
 *  - contra o Shelly: 108 de 200 → 54,0%            abaixo de 55%
 *  - contra o Colt: 10 de 40 → 30,6% (−22,4)        counterado
 *  - contra o Mortis: 20 de 50 → 42,2% (−10,8)      counterado
 *  - com o Poco: 18 de 30 → 58,3% (+5,25)           sinergia
 *  - com a Bibi: 108 de 200 → 54,0%                 não conta
 *  - com o Max: 6 de 8                              poucos jogos
 *  - com o Gus: 20 de 50 → 42,2% (−10,8)            anti-sinergia
 *  - com o Brock: 23 de 50 → 47,2%                  não conta (entre 45% e 55%)
 * O Poco ganha 50% e perde com o Colt (10 de 40 → 30%).
 */
function ligarApi() {
  definirFonteObservada(montarFonteObservada({
    brawlers: [
      { brawler: "Nita", jogos: 100, vitorias: 53 },
      { brawler: "Poco", jogos: 100, vitorias: 50 },
    ],
    confrontos: [
      { a: "Nita", b: "Bull", jogos: 30, vitorias: 18 },
      { a: "Nita", b: "Rico", jogos: 8, vitorias: 6 },
      { a: "Nita", b: "Shelly", jogos: 200, vitorias: 108 },
      { a: "Nita", b: "Colt", jogos: 40, vitorias: 10 },
      { a: "Nita", b: "Mortis", jogos: 50, vitorias: 20 },
      { a: "Poco", b: "Colt", jogos: 40, vitorias: 10 },
    ],
    sinergias: [
      { a: "Nita", b: "Poco", jogos: 30, vitorias: 18 },
      { a: "Nita", b: "Bibi", jogos: 200, vitorias: 108 },
      { a: "Nita", b: "Max", jogos: 8, vitorias: 6 },
      { a: "Nita", b: "Gus", jogos: 50, vitorias: 20 },
      { a: "Nita", b: "Brock", jogos: 50, vitorias: 23 },
    ],
  }));
}

const contra = (inimigos: string[], extra: Record<string, unknown> = {}, score = 70) =>
  calculateDraftSignal(linha("Nita", score), { enemyRows: inimigos.map((nome) => linha(nome)), pickNumber: 2, ...extra });
const com = (aliados: string[], extra: Record<string, unknown> = {}, score = 70) =>
  calculateDraftSignal(linha("Nita", score), { allyRows: aliados.map((nome) => linha(nome)), pickNumber: 3, ...extra });
const multiplicadorDoPick2 = getCounterPickMultiplier(2, defaultDraftRuleSettings);

describe("v170 · as regras da API por omissão", () => {
  it("55% para counter e sinergia, 20 jogos, counter e sinergia a 1, ban a 0,5 e a pressão ligada", () => {
    expect(defaultDraftApiRuleSettings).toEqual({ apiCounterMinimo: 0.55, apiSinergiaMinima: 0.55, apiJogosMinimos: 20, apiPesoCounter: 1, apiPesoSinergia: 1, apiPesoBan: 0.5, apiPressaoPorAliado: 1 });
  });

  it("valores estragados voltam aos de omissão; os de fora dos limites encostam ao limite", () => {
    const lidas = normalizarRegrasDaApi({ apiPesoCounter: Number.NaN, apiJogosMinimos: 9999, apiCounterMinimo: "x" as unknown as number, apiPesoSinergia: -2 });
    expect(lidas).toMatchObject({ apiPesoCounter: 1, apiJogosMinimos: 500, apiCounterMinimo: 0.55, apiPesoSinergia: 0 });
    expect(normalizarRegrasDaApi(null)).toEqual(defaultDraftApiRuleSettings);
  });
});

describe("v170 · uma só regra para counter e sinergia (avaliarParDaApi)", () => {
  it("os mesmos números dão o mesmo resultado nos dois lados", () => {
    ligarApi();
    const pares: Array<[string, string]> = [["Bull", "Poco"], ["Shelly", "Bibi"], ["Rico", "Max"], ["Mortis", "Gus"]];
    for (const [inimigo, aliado] of pares) {
      const confronto = confrontoObservadoComJogos("Nita", inimigo)!;
      const dupla = sinergiaObservadaComJogos("Nita", aliado)!;
      expect(dupla).toEqual(confronto);
      expect(avaliarParDaApi(dupla, 55, 20)).toEqual(avaliarParDaApi(confronto, 55, 20));
    }
    expect(avaliarParDaApi(confrontoObservadoComJogos("Nita", "Bull"), 55, 20)).toEqual({ conta: "bonus", motivo: "conta" });
    expect(avaliarParDaApi(confrontoObservadoComJogos("Nita", "Rico"), 55, 20)).toEqual({ conta: "nao", motivo: "poucos-jogos" });
    expect(avaliarParDaApi(confrontoObservadoComJogos("Nita", "Shelly"), 55, 20)).toEqual({ conta: "nao", motivo: "fora-do-minimo" });
    expect(avaliarParDaApi(confrontoObservadoComJogos("Nita", "Mortis"), 55, 20)).toEqual({ conta: "desbonus", motivo: "conta" });
    expect(avaliarParDaApi(null, 55, 20)).toEqual({ conta: "nao", motivo: "sem-jogos" });
  });

  it("os 20 jogos são o limite: com 20 conta, com 19 não", () => {
    const par = { delta: 5, vitoria: 58, jogos: 20 };
    expect(avaliarParDaApi(par, 55, 20).conta).toBe("bonus");
    expect(avaliarParDaApi({ ...par, jogos: 19 }, 55, 20).conta).toBe("nao");
    // Exatamente 55% conta; 54,9% não.
    expect(avaliarParDaApi({ ...par, vitoria: 55 }, 55, 20).conta).toBe("bonus");
    expect(avaliarParDaApi({ ...par, vitoria: 54.9 }, 55, 20).conta).toBe("nao");
    // Exatamente 45% conta como desbónus; 45,1% não.
    expect(avaliarParDaApi({ delta: -5, vitoria: 45, jogos: 30 }, 55, 20).conta).toBe("desbonus");
    expect(avaliarParDaApi({ delta: -5, vitoria: 45.1, jogos: 30 }, 55, 20).conta).toBe("nao");
  });
});

describe("v170 · counter e counterado com a API", () => {
  it("58% com 30 jogos soma a diferença em pontos — o mesmo para uma base de 90 e uma de 40", () => {
    ligarApi();
    const delta = confrontoObservadoComJogos("Nita", "Bull")!.delta;
    expect(delta).toBeCloseTo(5.25, 2);
    const forte = contra(["Bull"], {}, 90).scoreBreakdown;
    const fraca = contra(["Bull"], {}, 40).scoreBreakdown;
    expect(forte.counterPoints).toBeCloseTo(delta * multiplicadorDoPick2, 6);
    expect(fraca.counterPoints).toBeCloseTo(forte.counterPoints, 6);
    expect(contra(["Bull"]).scoreBreakdown.activeBonuses.join(" ")).toContain("Bull 58.3% em 30 jogos");
  });

  it("com poucos jogos, ou abaixo de 55%, não conta", () => {
    ligarApi();
    expect(contra(["Rico"]).scoreBreakdown.counterPoints).toBe(0);
    expect(contra(["Shelly"]).scoreBreakdown.counterPoints).toBe(0);
    const [rico, shelly] = contra(["Rico", "Shelly"]).bonusSources.confrontosAvaliados!;
    expect(rico).toMatchObject({ inimigo: "Rico", conta: "nao", motivo: "poucos-jogos", jogos: 8 });
    expect(shelly).toMatchObject({ inimigo: "Shelly", conta: "nao", motivo: "fora-do-minimo", jogos: 200, percentagem: 54 });
  });

  it("45% ou menos com jogos suficientes tira pontos (counterado)", () => {
    ligarApi();
    const delta = confrontoObservadoComJogos("Nita", "Mortis")!.delta;
    expect(delta).toBeLessThan(0);
    expect(contra(["Mortis"]).scoreBreakdown.counterPoints).toBeCloseTo(delta * multiplicadorDoPick2, 6);
    expect(contra(["Mortis"]).draftScore).toBeLessThan(contra([]).draftScore);
  });

  it("o peso multiplica os pontos (2 dobra, 0,5 corta a metade), e o ajuste do pick também", () => {
    ligarApi();
    const normal = contra(["Bull"]).scoreBreakdown.counterPoints;
    expect(contra(["Bull"], { apiRuleSettings: { apiPesoCounter: 2 } }).scoreBreakdown.counterPoints).toBeCloseTo(normal * 2, 6);
    expect(contra(["Bull"], { apiRuleSettings: { apiPesoCounter: 0.5 } }).scoreBreakdown.counterPoints).toBeCloseTo(normal / 2, 6);
    expect(contra(["Bull"], { ruleSettings: { counterPickMultiplier2: multiplicadorDoPick2 * 3 } }).scoreBreakdown.counterPoints).toBeCloseTo(normal * 3, 6);
  });

  it("o mínimo e os jogos mudam-se nas regras", () => {
    ligarApi();
    expect(contra(["Rico"], { apiRuleSettings: { apiJogosMinimos: 5 } }).scoreBreakdown.counterPoints).toBeGreaterThan(0);
    expect(contra(["Bull"], { apiRuleSettings: { apiCounterMinimo: 0.6 } }).scoreBreakdown.counterPoints).toBe(0);
  });
});

describe("v170 · sinergia e anti-sinergia com a API (a mesma lógica)", () => {
  it("a dupla a 58% com 30 jogos, acima dos 53% dela, soma — o mesmo para uma base de 90 e uma de 40", () => {
    ligarApi();
    const delta = sinergiaObservadaComJogos("Nita", "Poco")!.delta;
    const forte = com(["Poco"], {}, 90).scoreBreakdown;
    expect(forte.synergyPoints).toBeCloseTo(delta, 6);
    expect(com(["Poco"], {}, 40).scoreBreakdown.synergyPoints).toBeCloseTo(forte.synergyPoints, 6);
  });

  it("a 54%, ou com 8 jogos, não conta", () => {
    ligarApi();
    expect(com(["Bibi"]).scoreBreakdown.synergyPoints).toBe(0);
    expect(com(["Max"]).scoreBreakdown.synergyPoints).toBe(0);
    expect(com(["Max"]).bonusSources.duplasAvaliadas![0]).toMatchObject({ aliado: "Max", conta: false, motivo: "poucos-jogos", jogos: 8 });
  });

  it("a 45% ou menos tira (anti-sinergia); a 47% não tira", () => {
    ligarApi();
    const delta = sinergiaObservadaComJogos("Nita", "Gus")!.delta;
    expect(com(["Gus"]).scoreBreakdown.synergyPoints).toBeCloseTo(delta, 6);
    expect(com(["Gus"]).scoreBreakdown.synergyPoints).toBeLessThan(0);
    expect(com(["Brock"]).scoreBreakdown.synergyPoints).toBe(0);
  });

  it("o peso da sinergia multiplica, nos dois sentidos", () => {
    ligarApi();
    expect(com(["Poco"], { apiRuleSettings: { apiPesoSinergia: 2 } }).scoreBreakdown.synergyPoints).toBeCloseTo(com(["Poco"]).scoreBreakdown.synergyPoints * 2, 6);
    expect(com(["Gus"], { apiRuleSettings: { apiPesoSinergia: 0.5 } }).scoreBreakdown.synergyPoints).toBeCloseTo(com(["Gus"]).scoreBreakdown.synergyPoints / 2, 6);
  });
});

describe("v170 · counter banido e pressão por aliado com a API", () => {
  it("banir um counter dele (Colt, 30,6% em 40 jogos) dá meia diferença em pontos (peso 0,5), enquanto o adversário não revelou os três", () => {
    ligarApi();
    const delta = confrontoObservadoComJogos("Nita", "Colt")!.delta;
    const comBan = contra(["Bull"], { bannedNames: ["Colt"] });
    expect(comBan.scoreBreakdown.banPoints).toBeCloseTo(Math.abs(delta) * 0.5, 6);
    expect(comBan.bonusSources.bannedCounters).toEqual(["Colt"]);
    expect(contra(["Bull"], { bannedNames: ["Colt"], apiRuleSettings: { apiPesoBan: 2 } }).scoreBreakdown.banPoints).toBeCloseTo(Math.abs(delta) * 2, 6);
    // Um ban que não é counter dele (Shelly) não dá nada.
    expect(contra(["Bull"], { bannedNames: ["Shelly"] }).scoreBreakdown.banPoints).toBe(0);
    // Com os três inimigos à vista, o ban já não conta.
    expect(contra(["Bull", "Rico", "Shelly"], { bannedNames: ["Colt"] }).scoreBreakdown.banPoints).toBe(0);
  });

  it("a pressão por aliado usa os confrontos da API e desliga-se nas regras da API", () => {
    ligarApi();
    const contexto = { enemyRows: [linha("Colt")], allyRows: [linha("Poco")], pickNumber: 4 };
    expect(calculateDraftSignal(linha("Nita"), contexto).scoreBreakdown.repeatedEnemyCounterPressurePoints).toBeGreaterThan(0);
    expect(calculateDraftSignal(linha("Nita"), { ...contexto, apiRuleSettings: { apiPressaoPorAliado: 0 } }).scoreBreakdown.repeatedEnemyCounterPressurePoints).toBe(0);
    // Com 50 jogos no mínimo, o Colt (40 jogos) já não pressiona.
    expect(calculateDraftSignal(linha("Nita"), { ...contexto, apiRuleSettings: { apiJogosMinimos: 50 } }).scoreBreakdown.repeatedEnemyCounterPressurePoints).toBe(0);
  });
});

describe("v170 · os pontos somados chegam ao ecrã tal e qual", () => {
  it("no ranking, o counter de +5,25 sobe os pontos finais em +5,25 (Pontos Base)", () => {
    ligarApi();
    const linhas = [linha("Nita", 60), linha("Bull", 80), linha("Colt", 50), linha("Rico", 70)];
    const pontos = (inimigo: string) => rankDraftEntries(linhas, new Set([inimigo]), "", "Todos", { enemyRows: [linhas.find((l) => l.brawler === inimigo)!], pickNumber: 2 })
      .find((entrada) => entrada.row.brawler === "Nita")!;
    // Contra o Rico (8 jogos, não conta) e contra o Bull (conta): a diferença é só o counter.
    const delta = confrontoObservadoComJogos("Nita", "Bull")!.delta * multiplicadorDoPick2;
    expect(pontos("Bull").finalPoints - pontos("Rico").finalPoints).toBeCloseTo(delta, 6);
  });
});

describe("v170 · com a API desligada, as regras da API não mexem em nada", () => {
  it("o mesmo draft com pesos da API diferentes dá exatamente o mesmo", () => {
    const normal = calculateDraftSignal(linha("Nita"), { enemyRows: [linha("Bull")], allyRows: [linha("Poco")], pickNumber: 4 }).draftScore;
    const comPesos = calculateDraftSignal(linha("Nita"), { enemyRows: [linha("Bull")], allyRows: [linha("Poco")], pickNumber: 4, apiRuleSettings: { apiPesoCounter: 3, apiPesoSinergia: 0, apiJogosMinimos: 500 } }).draftScore;
    expect(comPesos).toBe(normal);
  });
});

describe("v170 · o painel tem as Regras da API", () => {
  const painel = readFileSync(resolve(process.cwd(), "client/src/components/PainelDasRegrasDaApi.tsx"), "utf8");
  const draft = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
  it("as sete regras aparecem no painel, e o Draft passa-as ao motor", () => {
    for (const chave of Object.keys(defaultDraftApiRuleSettings)) expect(painel).toContain(`chave: "${chave}"`);
    expect(painel).toContain("Regras da API");
    expect(draft).toContain("<PainelDasRegrasDaApi");
    expect(draft).toContain("apiRuleSettings: regrasDaApi.regras");
  });
});

describe("v170 · a dica do cartão mostra cada par, com a percentagem, os jogos e se conta", () => {
  it("com a API: pontos de quem conta, e o motivo de quem não conta", () => {
    ligarApi();
    const sinalDoCartao = calculateDraftSignal(linha("Nita"), { enemyRows: ["Bull", "Rico", "Shelly", "Mortis"].map((nome) => linha(nome)), allyRows: ["Poco", "Max", "Brock"].map((nome) => linha(nome)), pickNumber: 5 });
    const { confrontos, duplas } = paresDaDica(sinalDoCartao);
    const por = (lista: typeof confrontos, nome: string) => lista.find((par) => par.nome === nome)!;
    expect(por(confrontos, "Bull")).toMatchObject({ texto: "58,3% · 30 j", conta: true, desbonus: false });
    expect(por(confrontos, "Bull").efeito).toMatch(/^\+\d+,\d\d pts$/);
    expect(por(confrontos, "Rico")).toMatchObject({ efeito: "não conta (faltam 12 jogos)", conta: false });
    expect(por(confrontos, "Shelly")).toMatchObject({ texto: "54% · 200 j", conta: false });
    expect(por(confrontos, "Shelly").efeito).toBe("não conta (45–55%)");
    expect(por(confrontos, "Mortis")).toMatchObject({ conta: true, desbonus: true });
    expect(por(confrontos, "Mortis").efeito).toMatch(/^−\d+,\d\d pts$/);
    expect(por(duplas, "Poco")).toMatchObject({ texto: "58,3% · 30 j", conta: true });
    expect(por(duplas, "Max").efeito).toBe("não conta (faltam 12 jogos)");
    expect(por(duplas, "Brock")).toMatchObject({ texto: "47,2% · 50 j", conta: false });
    expect(motivoDoPar({ conta: "nao", motivo: "poucos-jogos", jogos: 19 }, 20, 55)).toBe("não conta (falta 1 jogo)");
  });

  it("com as fontes: a percentagem do duelo e se conta", () => {
    const sinalDoCartao = calculateDraftSignal(linha("Nita"), { enemyRows: [linha("Bull")], pickNumber: 2 });
    const [bull] = paresDaDica(sinalDoCartao).confrontos;
    expect(bull.nome).toBe("Bull");
    expect(bull.texto).toMatch(/%$/);
    expect(["conta", "conta (contra)", "não conta (sem vantagem)"]).toContain(bull.efeito);
  });
});
