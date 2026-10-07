import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calculateDraftSignal, getBrawlerClass } from "@shared/draft";
import { defaultDraftRuleSettings, normalizeDraftRuleSettings } from "@shared/draftRules";
import { getMatchupValue, definirLeituraDasDuasFichas } from "@shared/counterMatchupValue";
import { getCounterSourceProfiles, setCounterSyncSnapshot } from "@shared/counterSourceRelations";
import { brawlScopeMatchupDeltas } from "@shared/brawlScopeMatchupDeltas.generated";
import { allRankedRows } from "../client/src/data/rankedData";
import { defaultDraftRulePreference } from "../client/src/lib/draftRules";

/*
 * v168 — no Draft Híbrido, como OPÇÕES (desde a v169, com as fontes, o Draft
 * volta por omissão ao de antes da v168; o que a v168 queria passou para as
 * regras da API, ver `draftApi.test.ts`):
 *  - desligar a sinergia de equipa tripla;
 *  - a dupla só conta quando o par ganha mais do que o brawler sozinho;
 *  - um counter (e o desbónus de counter, e a pressão por aliado) só conta a
 *    partir de 55% no confronto — a mesma percentagem que os duelos mostram;
 *  - Mesma classe, Worst Teammate e Pressão por aliado desligam-se nas regras.
 */
const A_55 = { counterMinimo: 0.55 };

afterEach(() => {
  setCounterSyncSnapshot(undefined, { allowOfflineFallback: true });
  definirLeituraDasDuasFichas(true);
});

const linha = (nome: string) => allRankedRows.find((r) => r.brawler === nome) ?? { map: "Teste", brawler: nome, winRate: 52, usage: 5, score: 60 };
const nomes = Object.keys(brawlScopeMatchupDeltas).filter((nome) => allRankedRows.some((r) => r.brawler === nome));

/** O primeiro par real (candidato, inimigo) cujo confronto passa num teste. */
function acharPar(passa: (delta: number) => boolean) {
  for (const a of nomes) for (const b of nomes) {
    if (a === b) continue;
    const delta = getMatchupValue(a, b).total;
    if (passa(delta)) return { a, b, delta };
  }
  throw new Error("sem par nos dados");
}

describe("v169 · com as fontes, as regras por omissão são as de antes da v168", () => {
  it("tripla ligada, dupla como sempre, counter com qualquer diferença, e os três desbónus ligados", () => {
    expect(defaultDraftRuleSettings).toMatchObject({ sinergiaDeEquipaTripla: 1, sinergiaSoAcimaDaVitoria: 0, counterMinimo: 0.5, desbonusMesmaClasse: 1, desbonusWorstTeammate: 1, desbonusPressaoPorAliado: 1 });
    // No painel, em percentagem: 50% e os interruptores a 0/100.
    expect(defaultDraftRulePreference).toMatchObject({ counterMinimo: 50, sinergiaDeEquipaTripla: 100, sinergiaSoAcimaDaVitoria: 0, desbonusMesmaClasse: 100 });
    // Uma preferência gravada antes da v168 (sem as chaves novas) fica como era.
    expect(normalizeDraftRuleSettings({ sameClassPenalty: 0.03 })).toMatchObject({ counterMinimo: 0.5, sinergiaDeEquipaTripla: 1, sinergiaSoAcimaDaVitoria: 0 });
  });

  it("um counter fraco (abaixo de 55%) volta a contar por omissão", () => {
    const fraco = acharPar((d) => d > 0.5 && d < 4.5);
    expect(calculateDraftSignal(linha(fraco.a), { enemyRows: [linha(fraco.b)], pickNumber: 2 }).scoreBreakdown.counterPoints).toBeGreaterThan(0);
  });
});

describe("v168 · opção: counter só a partir de 55% (a percentagem do duelo: 50% + a diferença)", () => {
  it("a favor: 55% ou mais conta; abaixo de 55% não conta", () => {
    const forte = acharPar((d) => d >= 5.5);
    const fraco = acharPar((d) => d > 0.5 && d < 4.5);
    const comForte = calculateDraftSignal(linha(forte.a), { enemyRows: [linha(forte.b)], pickNumber: 2, ruleSettings: A_55 });
    const comFraco = calculateDraftSignal(linha(fraco.a), { enemyRows: [linha(fraco.b)], pickNumber: 2, ruleSettings: A_55 });
    expect(comForte.scoreBreakdown.counterPoints).toBeGreaterThan(0);
    expect(comFraco.scoreBreakdown.counterPoints).toBe(0);
    // Com o limiar em 50% (a regra de antes), o fraco volta a contar.
    const antes = calculateDraftSignal(linha(fraco.a), { enemyRows: [linha(fraco.b)], pickNumber: 2, ruleSettings: { counterMinimo: 0.5 } });
    expect(antes.scoreBreakdown.counterPoints).toBeGreaterThan(0);
  });

  it("contra: o desbónus de counter só quando o adversário tem 55% ou mais", () => {
    const perde = acharPar((d) => d <= -5.5);
    const quase = acharPar((d) => d < -0.5 && d > -4.5);
    expect(calculateDraftSignal(linha(perde.a), { enemyRows: [linha(perde.b)], pickNumber: 2, ruleSettings: A_55 }).scoreBreakdown.counterPoints).toBeLessThan(0);
    expect(calculateDraftSignal(linha(quase.a), { enemyRows: [linha(quase.b)], pickNumber: 2, ruleSettings: A_55 }).scoreBreakdown.counterPoints).toBe(0);
    expect(calculateDraftSignal(linha(quase.a), { enemyRows: [linha(quase.b)], pickNumber: 2 }).scoreBreakdown.counterPoints).toBeLessThan(0);
  });

  it("o limiar é configurável: logo acima da diferença do par deixa de contar, logo abaixo conta", () => {
    const par = acharPar((d) => d >= 3 && d <= 20);
    const limiar = (pp: number) => ({ counterMinimo: (50 + pp) / 100 });
    expect(calculateDraftSignal(linha(par.a), { enemyRows: [linha(par.b)], pickNumber: 2, ruleSettings: limiar(par.delta + 0.5) }).scoreBreakdown.counterPoints).toBe(0);
    expect(calculateDraftSignal(linha(par.a), { enemyRows: [linha(par.b)], pickNumber: 2, ruleSettings: limiar(par.delta - 0.5) }).scoreBreakdown.counterPoints).toBeGreaterThan(0);
  });
});

describe("v168 · pressão por aliado", () => {
  /** Um inimigo que countera (≥55%) o candidato e um aliado. */
  function cenarioDePressao() {
    for (const inimigo of nomes) {
      const counterados = nomes.filter((n) => n !== inimigo && getMatchupValue(n, inimigo).total <= -5.5);
      if (counterados.length >= 2) return { inimigo, candidato: counterados[0], aliado: counterados[1] };
    }
    throw new Error("sem cenário de pressão nos dados");
  }

  it("conta com 55% contra cada um, e desliga-se no interruptor sem perder a percentagem", () => {
    const { inimigo, candidato, aliado } = cenarioDePressao();
    const contexto = { enemyRows: [linha(inimigo)], allyRows: [linha(aliado)], pickNumber: 4 };
    const ligada = calculateDraftSignal(linha(candidato), contexto);
    expect(ligada.scoreBreakdown.repeatedEnemyCounterPressurePoints).toBeGreaterThan(0);
    const desligada = calculateDraftSignal(linha(candidato), { ...contexto, ruleSettings: { desbonusPressaoPorAliado: 0 } });
    expect(desligada.scoreBreakdown.repeatedEnemyCounterPressurePoints).toBe(0);
    expect(desligada.scoreBreakdown.activeBonuses.join(" ")).not.toContain("Pressão Enemy Counter");
    // Com um limiar acima de qualquer confronto, também não conta.
    expect(calculateDraftSignal(linha(candidato), { ...contexto, ruleSettings: { counterMinimo: 0.99 } }).scoreBreakdown.repeatedEnemyCounterPressurePoints).toBe(0);
  });
});

describe("v168 · Mesma classe e Worst Teammate desligam-se", () => {
  it("Mesma classe: ligado tira pontos, desligado não", () => {
    const classe = getBrawlerClass("Piper");
    const outro = allRankedRows.find((r) => r.brawler !== "Piper" && getBrawlerClass(r.brawler) === classe)!.brawler;
    const ligado = calculateDraftSignal(linha("Piper"), { allyRows: [linha(outro)], pickNumber: 3 });
    const desligado = calculateDraftSignal(linha("Piper"), { allyRows: [linha(outro)], pickNumber: 3, ruleSettings: { desbonusMesmaClasse: 0 } });
    expect(ligado.scoreBreakdown.sameClassPenaltyPoints).toBeGreaterThan(0);
    expect(desligado.scoreBreakdown.sameClassPenaltyPoints).toBe(0);
    expect(desligado.scoreBreakdown.activeBonuses.join(" ")).not.toContain("Mesma Classe");
  });

  it("Worst Teammate: ligado tira pontos, desligado não", () => {
    const candidato = nomes.find((n) => (getCounterSourceProfiles(n).find((p) => p.source === "Brawl Planet")?.worstTeammates.length ?? 0) > 0)!;
    const mau = getCounterSourceProfiles(candidato).find((p) => p.source === "Brawl Planet")!.worstTeammates[0].brawler;
    const ligado = calculateDraftSignal(linha(candidato), { allyRows: [linha(mau)], pickNumber: 3 });
    const desligado = calculateDraftSignal(linha(candidato), { allyRows: [linha(mau)], pickNumber: 3, ruleSettings: { desbonusWorstTeammate: 0 } });
    expect(ligado.scoreBreakdown.worstTeammatePenaltyPoints).toBeGreaterThan(0);
    expect(desligado.scoreBreakdown.worstTeammatePenaltyPoints).toBe(0);
  });
});

describe("v168 · o painel de regras tem as opções", () => {
  const draft = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
  it("interruptores e o counter mínimo", () => {
    for (const chave of ["sinergiaSoAcimaDaVitoria", "sinergiaDeEquipaTripla", "counterMinimo", "desbonusPressaoPorAliado", "desbonusMesmaClasse", "desbonusWorstTeammate"]) {
      expect(draft).toContain(`key: "${chave}"`);
    }
  });
});
