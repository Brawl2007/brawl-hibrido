import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AJUSTES_METAPICK,
  CONFIG_DO_MOTOR,
  PESOS_PL_PRODIGY,
  lerConfigDoMotor,
  pontuarComoMetaPick,
  pontuarComoPLProdigy,
  type ComponentesDoCandidato,
} from "../shared/motoresDoDraft";
import { rankDraftEntries } from "../shared/draft";
import { allRankedRows } from "../client/src/data/rankedData";

/**
 * v162 — o Draft pode ordenar como o PL Prodigy (soma pesada de seis partes)
 * ou como o MetaPick (força no mapa + bónus com limites de ruído).
 */

const candidato = (brawler: string, extra: Partial<ComponentesDoCandidato> = {}): ComponentesDoCandidato => ({
  brawler, base: 50, vitoria: 50, uso: 10, counters: [], sinergias: [], encaixe: 50, countersBanidos: 0, riscos: [], ...extra,
});

describe("motor PL Prodigy: soma pesada de partes de 0 a 100", () => {
  it("usa os pesos das definições deles por omissão", () => {
    expect(PESOS_PL_PRODIGY).toEqual({ uso: 5, vitoria: 23, counter: 36, encaixe: 12, sinergia: 12, ban: 12 });
  });

  it("um bom counter passa à frente de quem só é forte no mapa (o counter pesa 36%, a vitória 23%)", () => {
    const [forte, counter] = pontuarComoPLProdigy([
      candidato("Forte", { vitoria: 60, uso: 20, counters: [0] }),
      candidato("Counter", { vitoria: 50, uso: 10, counters: [15] }),
    ]);
    // Forte: uso 100×5 + vitória 100×23 + counter 0×36 + (encaixe, sinergia, ban iguais → 50) × 36 = 46.
    expect(forte.pontos).toBeCloseTo(46, 6);
    // Counter: 0 + 0 + 100×36 + 50×36 = 54.
    expect(counter.pontos).toBeCloseTo(54, 6);
    expect(counter.partes.find((parte) => parte.nome === "Counter")?.valor).toBeCloseTo(36, 6);
  });

  it("pesos que não somam 100 são repartidos na mesma proporção; tudo a zero não dá NaN", () => {
    const dobro = Object.fromEntries(Object.entries(PESOS_PL_PRODIGY).map(([chave, valor]) => [chave, valor * 2])) as typeof PESOS_PL_PRODIGY;
    const lista = [candidato("A", { vitoria: 60 }), candidato("B", { vitoria: 40, counters: [10] })];
    expect(pontuarComoPLProdigy(lista, dobro).map((p) => p.pontos)).toEqual(pontuarComoPLProdigy(lista).map((p) => p.pontos));
    const zero = { uso: 0, vitoria: 0, counter: 0, encaixe: 0, sinergia: 0, ban: 0 };
    expect(pontuarComoPLProdigy(lista, zero).every((p) => p.pontos === 0)).toBe(true);
  });

  it("num mapa só com o Score publicado, o Score faz as vezes da vitória e do uso", () => {
    const [fraco, forte] = pontuarComoPLProdigy([
      candidato("Fraco", { base: 40, vitoria: null, uso: null }),
      candidato("Forte", { base: 90, vitoria: null, uso: null }),
    ]);
    expect(forte.pontos - fraco.pontos).toBeCloseTo(28, 6); // (5 + 23) × 100 / 100
  });

  it("os counters dele banidos contam na parte «Ban»", () => {
    const [semBan, comBan] = pontuarComoPLProdigy([candidato("SemBan"), candidato("ComBan", { countersBanidos: 2 })]);
    expect(comBan.pontos - semBan.pontos).toBeCloseTo(12, 6);
  });
});

describe("motor MetaPick: força no mapa + bónus com limites", () => {
  it("usa os valores das definições deles por omissão", () => {
    expect(AJUSTES_METAPICK).toEqual({ sinergia: 1.2, counter: 2.5, minSinergia: 0.2, minCounter: 0.2, penalizacaoBan: 0.5, topCounters: 5 });
  });

  it("base + 10 × (2,5 × counter + 1,2 × sinergia − 0,5 × risco), em dezenas de pp", () => {
    const [um] = pontuarComoMetaPick([candidato("Um", { base: 70, counters: [10], sinergias: [5], riscos: [8] })]);
    // 70 + 10×2,5×1,0 + 10×1,2×0,5 − 10×0,5×0,8 = 70 + 25 + 6 − 4 = 97.
    expect(um.pontos).toBeCloseTo(97, 6);
  });

  it("ignora o ruído: confrontos e sinergias abaixo do mínimo não contam", () => {
    const [pequeno] = pontuarComoMetaPick([candidato("Pequeno", { base: 50, counters: [1.5], sinergias: [-1.9] })]);
    expect(pequeno.pontos).toBe(50);
  });

  it("só os 5 melhores counters de cada inimigo recebem o bónus; ser counterado conta sempre", () => {
    const lista = [12, 11, 10, 9, 8, 7].map((valor, i) => candidato(`C${i}`, { base: 50, counters: [valor] }));
    lista.push(candidato("Counterado", { base: 50, counters: [-10] }));
    const pontos = pontuarComoMetaPick(lista).map((p) => p.pontos);
    expect(pontos.slice(0, 5)).toEqual([80, 77.5, 75, 72.5, 70]);
    expect(pontos[5]).toBe(50); // o 6.º melhor counter fica sem bónus
    expect(pontos[6]).toBe(25); // −10 pp × 2,5 × 10 / 10
  });
});

describe("configuração guardada", () => {
  it("valores estragados voltam aos de omissão e os fora do limite são cortados", () => {
    expect(lerConfigDoMotor(null)).toEqual(CONFIG_DO_MOTOR);
    expect(lerConfigDoMotor("{isto não é json")).toEqual(CONFIG_DO_MOTOR);
    const lida = lerConfigDoMotor(JSON.stringify({ motor: "metapick", pl: { counter: 500, uso: "x" }, meta: { counter: -3, topCounters: 99 } }));
    expect(lida.motor).toBe("metapick");
    expect(lida.pl.counter).toBe(100);
    expect(lida.pl.uso).toBe(PESOS_PL_PRODIGY.uso);
    expect(lida.meta.counter).toBe(0);
    expect(lida.meta.topCounters).toBe(10);
    expect(lerConfigDoMotor(JSON.stringify({ motor: "outro" })).motor).toBe("hibrido");
  });
});

describe("o Draft com cada motor", () => {
  const mapa = allRankedRows.find((row) => row.map)?.map;
  const linhas = allRankedRows.filter((row) => row.map === mapa).slice(0, 40);
  const inimigo = linhas[5];
  const contexto = { enemyRows: [inimigo], allyRows: [], mapModeId: inimigo.modeId, pickNumber: 2, completedPickCount: 1 };
  const bloqueados = new Set([inimigo.brawler]);

  it("o Brawl Híbrido fica como estava (sem motor, ou com o motor «hibrido»)", () => {
    const sem = rankDraftEntries(linhas, bloqueados, "", "Todos", contexto);
    const hibrido = rankDraftEntries(linhas, bloqueados, "", "Todos", { ...contexto, motor: CONFIG_DO_MOTOR });
    expect(hibrido.map((e) => [e.row.brawler, e.finalPoints])).toEqual(sem.map((e) => [e.row.brawler, e.finalPoints]));
    expect(hibrido.every((e) => e.motor === undefined)).toBe(true);
  });

  it.each(["plprodigy", "metapick"] as const)("%s reordena pelos pontos dele e diz de onde vieram", (motor) => {
    const lista = rankDraftEntries(linhas, bloqueados, "", "Todos", { ...contexto, motor: { ...CONFIG_DO_MOTOR, motor } });
    expect(lista.length).toBe(linhas.length - 1);
    expect(lista.map((e) => e.rank)).toEqual(lista.map((_, i) => i + 1));
    for (let i = 1; i < lista.length; i++) expect(lista[i - 1].finalPoints).toBeGreaterThanOrEqual(lista[i].finalPoints);
    for (const entrada of lista) {
      expect(entrada.motor?.nome).toBe(motor);
      expect(entrada.finalPoints).toBeCloseTo(entrada.motor!.partes.reduce((soma, parte) => soma + parte.valor, 0), 6);
    }
  });
});

describe("o Draft tem o seletor do motor", () => {
  const draft = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
  it("painel, botão à vista e o motor no contexto do ranking", () => {
    expect(draft).toContain('{ id: "motor", label: "Motor do Draft (Híbrido, PL Prodigy, MetaPick)", soDono: false }');
    expect(draft).toContain("<PainelDoMotor config={motorDoDraft.config} onChange={motorDoDraft.mudar} />");
    expect(draft).toContain("motor: motorDoDraft.config }), [motorDoDraft.config,");
    expect(draft).toContain("Motor: <b>{NOMES_DOS_MOTORES[motorDoDraft.config.motor]}</b>");
  });
});
