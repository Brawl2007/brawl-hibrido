import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { confrontoObservado, definirFonteObservada, fonteObservadaAtiva, getMatchupValue, JOGOS_DE_PRIOR, montarFonteObservada, sinergiaObservada } from "@shared/counterMatchupValue";
import { calculateDraftSignal } from "@shared/draft";
import { resumirPartidas } from "@shared/partidasObservadas";
import { linhasDaApi } from "../client/src/hooks/useFonteApi";
import { RANKS_DO_FILTRO, rankDaPartida } from "@shared/ranksDoRanked";

/**
 * v157 — «Só API oficial» no Draft: ligado, só as partidas recolhidas contam;
 * desligado, as fontes de sempre voltam.
 */
const row = (brawler: string) => ({ brawler, score: 70, tier: "A" as const, brawlPlanetWinRate: 53 });
const p = (v: string[], d: string[]) => ({ mapId: "1", mode: "hotzone", vencedores: v, derrotados: d });

// Lumi ganha 30 de 40 contra o Surge; em geral ganha 50%.
const partidas = [
  ...Array.from({ length: 30 }, () => p(["Lumi", "Bull", "Colette"], ["Surge", "Emz", "Griff"])),
  ...Array.from({ length: 10 }, () => p(["Surge", "Emz", "Griff"], ["Lumi", "Bull", "Colette"])),
  ...Array.from({ length: 40 }, () => p(["Shelly", "Piper", "Colt"], ["Lumi", "Poco", "Max"])),
];
const resumo = resumirPartidas(partidas);

describe("fonte observada (Só API oficial)", () => {
  afterEach(() => definirFonteObservada(null));

  it("desligada por omissão: as outras fontes mandam", () => {
    expect(fonteObservadaAtiva()).toBe(false);
    expect(confrontoObservado("Lumi", "Surge")).toBeNull();
  });

  it("ligada, o confronto é a vitória a mais do que o habitual do brawler, puxada para zero com poucos jogos", () => {
    definirFonteObservada(montarFonteObservada(resumo));
    // Lumi: 30 vitórias em 80 jogos = 37,5% habitual; contra o Surge 30/40.
    const habitual = 30 / 80;
    const esperado = ((30 + JOGOS_DE_PRIOR * habitual) / (40 + JOGOS_DE_PRIOR) - habitual) * 100;
    expect(confrontoObservado("Lumi", "Surge")).toBeCloseTo(esperado, 1);
    expect(getMatchupValue("Lumi", "Surge").total).toBeCloseTo(esperado, 1);
    // Sem jogos entre os dois, não há valor — nem das outras fontes.
    expect(getMatchupValue("Lumi", "Wendy").total).toBe(0);
    expect(getMatchupValue("Nori", "Doug").total).toBe(0);
  });

  it("sinergia e anti-sinergia vêm das partidas e mexem no Score (com a regra da dupla desligada)", () => {
    definirFonteObservada(montarFonteObservada(resumo));
    expect(sinergiaObservada("Lumi", "Bull")!).toBeGreaterThan(0);
    expect(sinergiaObservada("Lumi", "Poco")!).toBeLessThan(0);
    const antes = { sinergiaSoAcimaDaVitoria: 0 };
    const comBull = calculateDraftSignal(row("Lumi"), { allyRows: [row("Bull")], pickNumber: 4, ruleSettings: antes }).scoreBreakdown;
    const comPoco = calculateDraftSignal(row("Lumi"), { allyRows: [row("Poco")], pickNumber: 4, ruleSettings: antes }).scoreBreakdown;
    expect(comBull.synergyPoints).toBeGreaterThan(0);
    expect(comPoco.synergyPoints).toBeLessThan(0);
  });

  it("v168 · com a API, a dupla só conta quando o par ganha mais neste mapa do que ele sozinho neste mapa", () => {
    definirFonteObservada(montarFonteObservada(resumo));
    const comBull = calculateDraftSignal(row("Lumi"), { allyRows: [row("Bull")], pickNumber: 4 }).scoreBreakdown;
    const comPoco = calculateDraftSignal(row("Lumi"), { allyRows: [row("Poco")], pickNumber: 4 }).scoreBreakdown;
    // Lumi com o Bull ganha mais do que a Lumi sozinha: conta.
    expect(comBull.synergyPoints).toBeGreaterThan(0);
    // Lumi com o Poco ganha menos: não conta (nem tira).
    expect(comPoco.synergyPoints).toBe(0);
  });

  it("desligar volta às fontes de sempre", () => {
    const antes = getMatchupValue("Nori", "Doug").total;
    definirFonteObservada(montarFonteObservada(resumo));
    expect(getMatchupValue("Nori", "Doug").total).toBe(0);
    definirFonteObservada(null);
    expect(getMatchupValue("Nori", "Doug").total).toBe(antes);
    expect(antes).not.toBe(0);
  });

  it("as linhas do mapa perdem as outras fontes e ganham a vitória e o uso das partidas", () => {
    const [lumi, wendy] = linhasDaApi([{ brawler: "Lumi", brawlPlanetWinRate: 60, topBrawlWinRate: 58 }, { brawler: "Wendy", brawlPlanetWinRate: 70 }], resumo);
    expect(lumi.brawlPlanetWinRate).toBeNull();
    expect(lumi.topBrawlWinRate).toBeNull();
    expect(lumi.winRate).toBeCloseTo(((30 + JOGOS_DE_PRIOR * 0.5) / (80 + JOGOS_DE_PRIOR)) * 100, 5);
    expect(lumi.usage).toBe(100);
    // Sem partidas neste mapa: 50%, uso 0 — não sabemos, não inventamos.
    expect(wendy.winRate).toBe(50);
    expect(wendy.usage).toBe(0);
  });

  it("o Draft tem o botão e o mapa deixa de usar as equipas do Brawl Planet", () => {
    const draft = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
    // v161: o botão é o mesmo do site todo (Draft, Mapas, Matriz).
    expect(draft).toContain("<BotaoApiOficial ligada={fonteApi.ligada} onAlternar={fonteApi.alternar} />");
    expect(draft).toContain("fonteApi.ligada ? [] :");
    expect(draft).toContain("fonteApiVersao: fonteApi.versao");
  });
});

describe("rank da partida", () => {
  it("usa os níveis dos seis jogadores e recusa valores fora do Ranked", () => {
    expect(rankDaPartida([16, 17, 18, 16, 17, 18])).toEqual({ min: 16, max: 18, medio: 17 });
    expect(rankDaPartida([16, 17, undefined])).toBeNull();
    expect(rankDaPartida([1200, 900])).toBeNull();
    expect(RANKS_DO_FILTRO.map((rank) => rank.nome)).toEqual(["Diamante", "Mítico", "Lendário", "Mestre+"]);
  });
});
