import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { definirFonteObservada, montarFonteObservada, confrontoObservado } from "@shared/counterMatchupValue";
import { CONFIG_DO_MOTOR, lerContextoDoMotor } from "@shared/motoresDoDraft";
import { getCounterProfile, rankDraftEntries, orderDraftEntries } from "@shared/draft";
import { linhasDaApi } from "../client/src/hooks/useFonteApi";

const dados = {
  partidas: 200,
  brawlers: [
    { brawler: "Nori", jogos: 200, vitorias: 80 },
    { brawler: "Doug", jogos: 200, vitorias: 40 },
  ],
  confrontos: [
    { a: "Nori", b: "Doug", jogos: 100, vitorias: 30 },
    { a: "Doug", b: "Nori", jogos: 100, vitorias: 70 },
    { a: "Nori", b: "Novo Brawler", jogos: 100, vitorias: 0 },
    { a: "Nori", b: "Bull", jogos: 100, vitorias: 60 },
  ],
  sinergias: [{ a: "Nori", b: "Rico", jogos: 100, vitorias: 70 }],
};
const contexto = {
  inimigos: [] as string[], aliados: [] as string[], bans: [] as string[],
  roster: ["Nori", "Doug", "Novo Brawler", "Bull", "Rico", "Jacky"],
  bloqueados: [] as string[], incluirRiscos: true,
};

describe("contexto dos motores locais com a API oficial", () => {
  beforeEach(() => definirFonteObservada(montarFonteObservada(dados)));
  afterEach(() => definirFonteObservada(null));

  it("um counter banido conta mesmo fora das janelas do Híbrido; um ban favorável não conta", () => {
    const lido = lerContextoDoMotor("Nori", { ...contexto, bans: ["Doug", "Doug", "Bull", "Jacky"] });
    expect(lido.countersBanidos).toEqual(["Doug"]);
  });

  it("com os três inimigos revelados, não há bónus de ban nem risco de futuros picks", () => {
    const lido = lerContextoDoMotor("Nori", { ...contexto, bans: ["Doug"], inimigos: ["Bull", "Rico", "Jacky"] });
    expect(lido.inimigosPorRevelar).toBe(0);
    expect(lido.countersBanidos).toEqual([]);
    expect(lido.riscos).toEqual([]);
  });

  it("o risco usa a perda do candidato e inclui futuros brawlers com dados, sem relações externas", () => {
    const lido = lerContextoDoMotor("Nori", contexto);
    expect(lido.riscos.map((relacao) => relacao.brawler)).toEqual(["Novo Brawler", "Doug"]);
    expect(lido.riscos[1].pp).toBeCloseTo(-confrontoObservado("Nori", "Doug")!);
    expect(lido.riscos[1].pp).not.toBe(confrontoObservado("Doug", "Nori"));
  });

  it("bans, aliados, inimigos e picks bloqueados deixam de ser opções de risco", () => {
    const lido = lerContextoDoMotor("Nori", { ...contexto, bans: ["Doug"], bloqueados: ["Novo Brawler"] });
    expect(lido.riscos).toEqual([]);
    const comAliado = lerContextoDoMotor("Nori", { ...contexto, aliados: ["Novo Brawler"], inimigos: ["Doug"] });
    expect(comAliado.riscos).toEqual([]);
  });

  it("confrontos e sinergias mudam quando chegam dados de outro mapa", () => {
    const selecao = { ...contexto, inimigos: ["Doug"], aliados: ["Rico"] };
    const antes = lerContextoDoMotor("Nori", selecao);
    expect(antes.counters[0].pp).toBeLessThan(0);
    expect(antes.sinergias[0].pp).toBeGreaterThan(0);
    definirFonteObservada(montarFonteObservada({
      ...dados,
      confrontos: [{ a: "Nori", b: "Doug", jogos: 100, vitorias: 90 }],
      sinergias: [{ a: "Nori", b: "Rico", jogos: 100, vitorias: 5 }],
    }));
    const depois = lerContextoDoMotor("Nori", selecao);
    expect(depois.counters[0].pp).toBeGreaterThan(0);
    expect(depois.sinergias[0].pp).toBeLessThan(0);
    expect(lerContextoDoMotor("Nori", { ...contexto, bans: ["Doug"] }).countersBanidos).toEqual([]);
  });

  it("sem dados do mapa não resta um perfil de counter de outra fonte", () => {
    definirFonteObservada(montarFonteObservada({ brawlers: [], confrontos: [], sinergias: [] }));
    const perfil = getCounterProfile("Nori", contexto.roster);
    expect(perfil.counters).toEqual([]);
    expect(perfil.counteredBy).toEqual([]);
    const lido = lerContextoDoMotor("Nori", { ...contexto, bans: ["Doug"] });
    expect(lido.riscos).toEqual([]);
    expect(lido.countersBanidos).toEqual([]);
    const [linha] = linhasDaApi([{ brawler: "Nori", winRate: 95, topBrawlWinRate: 98 }]);
    expect(linha.winRate).toBe(50);
    expect(linha.topBrawlWinRate).toBeNull();
  });

  it("o ranking PL usa os bans da API e desliga a contribuição no fim da revelação", () => {
    const linhas = ["Nori", "Bull", "Doug", "Rico", "Jacky"].map((brawler) => ({ brawler, tier: "A" as const, score: 60, winRate: 50, usage: 10 }));
    const config = { ...CONFIG_DO_MOTOR, motor: "plprodigy" as const, pl: { uso: 0, vitoria: 0, counter: 0, encaixe: 0, sinergia: 0, ban: 100 } };
    const base = { motor: config, bannedNames: ["Doug"], baseHybridTop25Names: [], baseHybridTop30Names: [] };
    const incompleto = rankDraftEntries(linhas, new Set(["Doug"]), "", "Todos", base);
    expect(incompleto[0].row.brawler).toBe("Nori");
    expect(incompleto[0].motor?.partes.find((parte) => parte.nome === "Ban")?.valor).toBe(100);
    const completo = rankDraftEntries(linhas, new Set(["Doug", "Bull", "Rico", "Jacky"]), "", "Todos", {
      ...base, enemyRows: linhas.filter((row) => ["Bull", "Rico", "Jacky"].includes(row.brawler)),
    });
    // Com os três revelados, o Ban sai da média (não pesa zero a todos).
    expect(completo[0].motor?.partes.some((parte) => parte.nome === "Ban")).toBe(false);
    expect(orderDraftEntries(incompleto, "context").map((entry) => entry.finalPoints)).toEqual(incompleto.map((entry) => entry.finalPoints));
  });
});
