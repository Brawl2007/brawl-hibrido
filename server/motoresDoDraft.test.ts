import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AJUSTES_METAPICK,
  CONFIG_DO_MOTOR,
  LIMITES_METAPICK,
  PESOS_PL_PRODIGY,
  PRESETS_PL_PRODIGY,
  escalaDoPLProdigy,
  lerConfigDoMotor,
  partesAtivasDoPL,
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

  /** O «rawScore» em %: a soma das partes, antes da escala do PL. */
  const bruto = (p: { partes: Array<{ valor: number }> }) => p.partes.reduce((soma, parte) => soma + parte.valor, 0);

  it("um bom counter passa à frente de quem só é forte no mapa (counter 36%, vitória 23%)", () => {
    const [forte, counter] = pontuarComoPLProdigy([
      candidato("Forte", { vitoria: 60, uso: 20, counters: [0] }),
      candidato("Counter", { vitoria: 50, uso: 10, counters: [15] }),
    ]);
    // Uso 5 + vitória 23 + encaixe 6. Sem aliado/ban, essas partes dão zero.
    expect(bruto(forte)).toBeCloseTo(34, 6);
    expect(bruto(counter)).toBeCloseTo(42, 6);
    expect(counter.pontos).toBeGreaterThan(forte.pontos);
    expect(forte.pontos).toBeCloseTo(escalaDoPLProdigy(0.34), 6);
    expect(counter.pontos).toBeCloseTo(escalaDoPLProdigy(0.42), 6);
    expect(counter.partes.find((parte) => parte.nome === "Counter")?.valor).toBeCloseTo(36, 6);
  });

  it("pesos que não somam 100 são repartidos na mesma proporção; tudo a zero não dá NaN", () => {
    const dobro = Object.fromEntries(Object.entries(PESOS_PL_PRODIGY).map(([chave, valor]) => [chave, valor * 2])) as typeof PESOS_PL_PRODIGY;
    const lista = [candidato("A", { vitoria: 60 }), candidato("B", { vitoria: 40, counters: [10] })];
    expect(pontuarComoPLProdigy(lista, dobro).map((p) => p.pontos)).toEqual(pontuarComoPLProdigy(lista).map((p) => p.pontos));
    const zero = { uso: 0, vitoria: 0, counter: 0, encaixe: 0, sinergia: 0, ban: 0 };
    const comZero = pontuarComoPLProdigy(lista, zero);
    expect(comZero.every((p) => bruto(p) === 0 && Number.isFinite(p.pontos))).toBe(true);
    expect(comZero[0].pontos).toBe(comZero[1].pontos);
  });

  it("num mapa só com o Score publicado, o Score faz as vezes da vitória e do uso", () => {
    const [fraco, forte] = pontuarComoPLProdigy([
      candidato("Fraco", { base: 40, vitoria: null, uso: null }),
      candidato("Forte", { base: 90, vitoria: null, uso: null }),
    ]);
    expect(bruto(forte) - bruto(fraco)).toBeCloseTo(28, 6);
  });

  it("os counters dele banidos contam na parte «Ban»", () => {
    const [semBan, comBan] = pontuarComoPLProdigy([candidato("SemBan"), candidato("ComBan", { countersBanidos: 2 })]);
    expect(bruto(comBan) - bruto(semBan)).toBeCloseTo(12, 6);
  });

  it("a escala estimada continua próxima dos dez exemplos da investigação anterior", () => {
    const pares: Array<[number, number]> = [[0.9938, 97], [0.5782, 81], [0.4531, 69], [0.4437, 68], [0.4388, 67], [0.4345, 67], [0.4156, 65], [0.4015, 63], [0.3435, 56], [0.3341, 54]];
    for (const [raw, total] of pares) expect(Math.abs(escalaDoPLProdigy(raw) - total)).toBeLessThan(0.6);
  });

  it("a normalização local é relativa aos candidatos disponíveis", () => {
    const todos = [
      candidato("Top", { vitoria: 64, uso: 30 }),
      candidato("Bom", { vitoria: 56, uso: 18 }),
      candidato("Medio", { vitoria: 51, uso: 12 }),
      candidato("Fraco", { vitoria: 46, uso: 4 }),
    ];
    const antes = pontuarComoPLProdigy(todos);
    const depois = pontuarComoPLProdigy(todos.slice(1));
    expect(depois[0].pontos).toBeGreaterThan(antes[1].pontos);
    expect(depois[1].pontos).toBeGreaterThan(antes[2].pontos);
  });

  it("v167 · as partes entram com o draft: no começo só a Vitória (23%) e o Uso (5%)", () => {
    expect(partesAtivasDoPL({ inimigos: 0, aliados: 0, bans: 0 })).toEqual({ uso: true, vitoria: true, counter: false, encaixe: false, sinergia: false, ban: false });
    expect(partesAtivasDoPL({ inimigos: 1, aliados: 0, bans: 0 })).toMatchObject({ counter: true, sinergia: false, encaixe: false, ban: false });
    expect(partesAtivasDoPL({ inimigos: 0, aliados: 1, bans: 0 })).toMatchObject({ counter: false, sinergia: true, encaixe: true, ban: false });
    expect(partesAtivasDoPL({ inimigos: 0, aliados: 0, bans: 1 })).toMatchObject({ counter: false, ban: true });
    // Só a base: a média pesada de 23 × vitória e 5 × uso (sobre 28), e só essas duas partes.
    const base = partesAtivasDoPL({ inimigos: 0, aliados: 0, bans: 0 });
    const [melhor, meio, pior] = pontuarComoPLProdigy([
      candidato("Melhor", { vitoria: 60, uso: 20, counters: [15], encaixe: 90, countersBanidos: 2 }),
      candidato("Meio", { vitoria: 55, uso: 10 }),
      candidato("Pior", { vitoria: 50, uso: 20 }),
    ], PESOS_PL_PRODIGY, base);
    expect(melhor.partes.map((p) => p.nome)).toEqual(["Uso", "Vitória"]);
    expect(bruto(melhor)).toBeCloseTo(100, 6);
    expect(bruto(meio)).toBeCloseTo((23 * 50 + 5 * 0) / 28, 6);
    expect(bruto(pior)).toBeCloseTo((23 * 0 + 5 * 100) / 28, 6);
    expect(melhor.pontos).toBeCloseTo(escalaDoPLProdigy(1), 6);
    // O counter, o encaixe e o ban dele não contam enquanto não houver picks nem bans.
    const [semMais] = pontuarComoPLProdigy([candidato("Melhor", { vitoria: 60, uso: 20 }), candidato("Meio", { vitoria: 55, uso: 10 }), candidato("Pior", { vitoria: 50, uso: 20 })], PESOS_PL_PRODIGY, base);
    expect(semMais.pontos).toBeCloseTo(melhor.pontos, 6);
  });

  it("presets: Masters+ (definições do site) e Diamante e abaixo (pedido que o site enviou)", () => {
    expect(PRESETS_PL_PRODIGY.mestre.pesos).toEqual(PESOS_PL_PRODIGY);
    expect(PRESETS_PL_PRODIGY.diamanteOuAbaixo.pesos).toEqual({ uso: 9, vitoria: 27, counter: 32, encaixe: 9, sinergia: 14, ban: 9 });
  });

  it("não mostra contribuições de counter, sinergia e ban quando não há sinal", () => {
    const pontos = pontuarComoPLProdigy([candidato("A"), candidato("B")]);
    for (const pontuacao of pontos) {
      for (const nome of ["Counter", "Sinergia", "Ban"]) {
        expect(pontuacao.partes.find((parte) => parte.nome === nome)?.valor).toBe(0);
      }
    }
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
    expect(lida.meta.topCounters).toBe(7);
    expect(lerConfigDoMotor(JSON.stringify({ motor: "outro" })).motor).toBe("hibrido");
  });

  it("os limites das barras do MetaPick são os do código público do site", () => {
    expect(LIMITES_METAPICK).toEqual({
      sinergia: { min: 0, max: 3, passo: 0.05 },
      counter: { min: 0, max: 4, passo: 0.05 },
      minSinergia: { min: 0, max: 1, passo: 0.05 },
      minCounter: { min: 0, max: 1, passo: 0.05 },
      penalizacaoBan: { min: 0, max: 1, passo: 0.05 },
      topCounters: { min: 1, max: 7, passo: 1 },
    });
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

  it("v167 · no Draft, o PL começa só com a base e ganha partes com os picks e os bans", () => {
    const pl = { ...CONFIG_DO_MOTOR, motor: "plprodigy" as const };
    const nomesDasPartes = (ctx: Parameters<typeof rankDraftEntries>[4]) => new Set(rankDraftEntries(linhas, new Set(), "", "Todos", { ...ctx, motor: pl }).flatMap((e) => e.motor!.partes.map((p) => p.nome)));
    expect(nomesDasPartes({ enemyRows: [], allyRows: [], mapModeId: inimigo.modeId, pickNumber: 1, completedPickCount: 0 })).toEqual(new Set(["Uso", "Vitória", "Exposição precoce"]));
    expect(nomesDasPartes({ enemyRows: [inimigo], allyRows: [], mapModeId: inimigo.modeId, pickNumber: 2, completedPickCount: 1 })).toEqual(new Set(["Uso", "Vitória", "Counter", "Exposição precoce"]));
    expect(nomesDasPartes({ enemyRows: [inimigo], allyRows: [linhas[7]], mapModeId: inimigo.modeId, pickNumber: 4, completedPickCount: 3, bannedNames: new Set([linhas[9].brawler]) }))
      .toEqual(new Set(["Uso", "Vitória", "Counter", "Encaixe", "Sinergia", "Ban"]));
  });

  it.each(["plprodigy", "metapick"] as const)("%s reordena pelos pontos dele e diz de onde vieram", (motor) => {
    const lista = rankDraftEntries(linhas, bloqueados, "", "Todos", { ...contexto, motor: { ...CONFIG_DO_MOTOR, motor } });
    expect(lista.length).toBe(linhas.length - 1);
    expect(lista.map((e) => e.rank)).toEqual(lista.map((_, i) => i + 1));
    for (let i = 1; i < lista.length; i++) expect(lista[i - 1].finalPoints).toBeGreaterThanOrEqual(lista[i].finalPoints);
    for (const entrada of lista) {
      expect(entrada.motor?.nome).toBe(motor);
      const somaDasPartes = entrada.motor!.partes.reduce((soma, parte) => soma + parte.valor, 0);
      // No PL as partes somam o rawScore (%) e os pontos passam pela escala do site; no MetaPick somam os pontos.
      expect(entrada.finalPoints).toBeCloseTo(motor === "plprodigy" ? escalaDoPLProdigy(somaDasPartes / 100) : somaDasPartes, 6);
    }
  });
});

describe("o Draft tem o seletor do motor", () => {
  const draft = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
  it("painel, botão à vista e o motor no contexto do ranking", () => {
    expect(draft).toContain('{ id: "motor", label: "Motor do Draft (Híbrido, PL Prodigy, MetaPick)", soDono: false }');
    expect(draft).toContain("<PainelDoMotor config={motorDoDraft.config} onChange={motorDoDraft.mudar} />");
    expect(draft).toContain("motor: motorDoDraft.config");
    expect(draft).toContain("dadosApi: dadosMotorApi");
    expect(draft).toContain("Motor: <b>{fonteApi.ligada ? \"API + apoio de confrontos\" : NOMES_DOS_MOTORES[motorDoDraft.config.motor]}</b>");
  });
});
