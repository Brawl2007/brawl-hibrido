import { describe, expect, it } from "vitest";
import {
  CAMPOS_DA_CONFIG,
  CAMPOS_DO_PICK,
  CONFIG_PADRAO,
  PRESETS_DA_CONFIG,
  configDeFabrica,
  configDoMotorApi,
  configDoPreset,
  normalizarConfigDoMotorApi,
  normalizarPick,
  pesosDaConfig,
  picksAPartirDasRegras,
  presetDaConfig,
  reequilibrarPick,
  type ConfigDoMotorApi,
} from "@shared/configDoMotorApi";
import { defaultDraftRuleSettings, pesosDoPickApi } from "@shared/draftRules";
import {
  ranquearCandidatosApiPerfeito,
  recomendarBansApi,
  type ConfrontoObservado,
  type EstatisticasApiMapa,
  type ParametrosMotorApi,
  type PerfilTaticoBrawler,
} from "@shared/motorApiPerfeito";

const comConfig = (alteracoes: (c: ConfigDoMotorApi) => void): ConfigDoMotorApi => {
  const c = configDeFabrica();
  alteracoes(c);
  return c;
};

describe("a configuração de fábrica é a da v181", () => {
  it("a distribuição por pick dá os mesmos pesos que as regras de sempre", () => {
    for (let turno = 1; turno <= 6; turno++) {
      const antigo = pesosDoPickApi(turno);
      const novo = pesosDaConfig(CONFIG_PADRAO, turno);
      for (const chave of ["vitoria", "uso", "mapa", "counter", "sinergia"] as const) expect(novo[chave]).toBeCloseTo(antigo[chave], 12);
    }
  });

  it("cada linha soma 100% e o pick 1 só tem força do mapa", () => {
    for (const pick of CONFIG_PADRAO.picks) expect(CAMPOS_DO_PICK.reduce((s, c) => s + pick[c], 0)).toBeCloseTo(100, 9);
    const [primeiro] = CONFIG_PADRAO.picks;
    expect(primeiro.vitoria).toBeCloseTo(70, 9);
    expect(primeiro.uso).toBeCloseTo(30, 9);
    expect(primeiro.counter + primeiro.sinergia).toBe(0);
  });

  it("pesos por pick que o dono já tinha viram a primeira distribuição", () => {
    const picks = picksAPartirDasRegras({ ...defaultDraftRuleSettings, winRatePick3: 0.5, counterPick3: 0.3 });
    expect(picks[2].counter).toBeGreaterThan(CONFIG_PADRAO.picks[2].counter);
    expect(pesosDaConfig({ picks }, 3).vitoria).toBeCloseTo(0.5, 12);
  });

  it("todos os campos do painel existem, estão dentro dos limites e têm o valor de fábrica por omissão", () => {
    const fabrica = configDeFabrica();
    for (const campo of CAMPOS_DA_CONFIG) {
      const valor = (fabrica[campo.secao] as unknown as Record<string, number>)[campo.campo];
      expect(typeof valor, `${campo.secao}.${campo.campo}`).toBe("number");
      expect(valor).toBeGreaterThanOrEqual(campo.min);
      expect(valor).toBeLessThanOrEqual(campo.max);
    }
  });
});

describe("normalização", () => {
  it("lixo vira a configuração de fábrica; valores fora dos limites são encostados", () => {
    expect(normalizarConfigDoMotorApi(null)).toEqual(configDeFabrica());
    expect(normalizarConfigDoMotorApi("x")).toEqual(configDeFabrica());
    const c = normalizarConfigDoMotorApi({ forcas: { counter: 99, hardCounter: -4, risco: "muito" }, bans: { peso: 7 }, viabilidade: { tamanhoDoGrupo: 12.6 } });
    expect(c.forcas).toMatchObject({ counter: 3, hardCounter: 0, risco: 1 });
    expect(c.bans.peso).toBe(3);
    expect(c.viabilidade.tamanhoDoGrupo).toBe(13);
  });

  it("uma linha de pick inválida volta à de fábrica; uma válida é posta a somar 100", () => {
    const padrao = CONFIG_PADRAO.picks[2];
    expect(normalizarPick({ vitoria: Number.NaN, uso: 1, counter: 1, sinergia: 1 }, padrao)).toEqual(padrao);
    expect(normalizarPick({ vitoria: 0, uso: 0, counter: 0, sinergia: 0 }, padrao)).toEqual(padrao);
    const n = normalizarPick({ vitoria: 20, uso: 20, counter: 40, sinergia: 20 }, padrao);
    expect(n).toEqual({ vitoria: 20, uso: 20, counter: 40, sinergia: 20 });
    expect(CAMPOS_DO_PICK.reduce((s, c) => s + normalizarPick({ vitoria: 1, uso: 1, counter: 1, sinergia: 1 }, padrao)[c], 0)).toBeCloseTo(100, 9);
  });

  it("mexer num valor do pick reparte a diferença pelos outros, mantendo a soma", () => {
    const pick = { vitoria: 50, uso: 20, counter: 20, sinergia: 10 };
    const novo = reequilibrarPick(pick, "counter", 40);
    expect(novo.counter).toBe(40);
    expect(CAMPOS_DO_PICK.reduce((s, c) => s + novo[c], 0)).toBeCloseTo(100, 9);
    expect(novo.vitoria / novo.uso).toBeCloseTo(50 / 20, 9);
    expect(reequilibrarPick({ vitoria: 100, uso: 0, counter: 0, sinergia: 0 }, "vitoria", 40)).toEqual({ vitoria: 40, uso: 20, counter: 20, sinergia: 20 });
    expect(reequilibrarPick(pick, "vitoria", 150).vitoria).toBe(100);
  });

  it("a normalização guardada pela identidade devolve sempre o mesmo objeto", () => {
    const c = configDeFabrica();
    expect(configDoMotorApi(c)).toBe(configDoMotorApi(c));
    expect(configDoMotorApi(undefined)).toBe(CONFIG_PADRAO);
  });
});

describe("presets", () => {
  it("são distintos, reconhecem-se e deixam de o ser quando se mexe", () => {
    const ids = PRESETS_DA_CONFIG.map((p) => p.id);
    expect(new Set(ids.map((id) => JSON.stringify(configDoPreset(id)))).size).toBe(ids.length);
    for (const id of ids) expect(presetDaConfig(configDoPreset(id))).toBe(id);
    expect(presetDaConfig(configDeFabrica())).toBe("padrao");
    expect(presetDaConfig(comConfig((c) => { c.forcas.risco = 0.9; }))).toBe("personalizado");
    for (const id of ids) for (const pick of configDoPreset(id).picks) expect(CAMPOS_DO_PICK.reduce((s, c) => s + pick[c], 0)).toBeCloseTo(100, 9);
  });
});

/* ---- o motor lê a configuração ---- */

const stats = (id: string, uso = 0.1, wr = 0.55): EstatisticasApiMapa => ({ brawlerId: id, jogosMapa: 1000, vitoriasMapa: wr * 1000, jogosModo: 2000, vitoriasModo: wr * 2000, taxaUsoMapa: uso });
const perfil = (id: string, classe: PerfilTaticoBrawler["classe"] = "controller"): PerfilTaticoBrawler => ({ id, role: "mid", classe, isAntiTank: true, isHeistDps: true });
const par = (taxa: number, n = 60): ConfrontoObservado => ({ jogosMapa: n, vitoriasA: taxa * n, jogosModo: n, vitoriasAModo: taxa * n });
const chaves = (a: string, b: string) => `${a}>${b}`;

function cenario(extra: Partial<ParametrosMotorApi> & { confrontos?: Record<string, ConfrontoObservado>; usos?: Record<string, number>; wrs?: Record<string, number> } = {}): ParametrosMotorApi {
  const { confrontos = {}, usos = {}, wrs = {}, ...resto } = extra;
  const ids = ["A", "B", "C", "E", "X", "Z"];
  return {
    disponiveisIds: ["A", "B", "C", "Z"],
    aliadosIds: [],
    inimigosIds: [],
    modoDeJogo: "knockout",
    estatisticasMapa: Object.fromEntries(ids.map((id, i) => [id, stats(id, usos[id] ?? 0.1 + i * 0.002, wrs[id] ?? 0.55 + i * 0.002)])),
    perfisTaticos: Object.fromEntries(ids.map((id) => [id, perfil(id)])),
    obterConfronto: (a, b) => confrontos[chaves(a, b)],
    obterSinergia: () => undefined,
    ...resto,
  };
}
const de = (p: ParametrosMotorApi, id: string) => ranquearCandidatosApiPerfeito(p).find((r) => r.brawlerId === id)!;

describe("sem mexer em nada, o motor dá o mesmo resultado de antes", () => {
  const cenarios: Array<[string, ParametrosMotorApi]> = [
    ["abertura", cenario()],
    ["counters e hard-counter", cenario({ turno: 4, inimigosIds: ["E"], aliadosIds: ["X"], confrontos: { [chaves("A", "E")]: par(0.8), [chaves("B", "E")]: par(0.2), [chaves("X", "E")]: par(0.7) } })],
    ["com bans", cenario({ turno: 2, banidosIds: ["Z"], confrontos: { [chaves("A", "Z")]: par(0.2), [chaves("B", "Z")]: par(0.3) } })],
  ];
  for (const [nome, p] of cenarios) {
    it(nome, () => {
      const antes = ranquearCandidatosApiPerfeito(p);
      const depois = ranquearCandidatosApiPerfeito({ ...p, config: configDeFabrica() });
      expect(depois.map((r) => r.brawlerId)).toEqual(antes.map((r) => r.brawlerId));
      depois.forEach((r, i) => {
        expect(r.logOddsFinal).toBeCloseTo(antes[i].logOddsFinal, 9);
        expect(r.bloqueado).toBe(antes[i].bloqueado);
      });
    });
  }
});

describe("cada controlo muda só a sua parte", () => {
  const confrontos = { [chaves("A", "E")]: par(0.8), [chaves("B", "E")]: par(0.2) };
  const base = () => cenario({ turno: 6, inimigosIds: ["E"], confrontos });
  const semTeto = (c: ConfigDoMotorApi) => { c.tetoDosBonus.ativo = 0; };

  it("Counter (bônus) e Counterado (desbônus) desligam-se à parte", () => {
    const padrao = comConfig(semTeto);
    expect(de({ ...base(), config: padrao }, "A").fatores.counterLiquidoLogit).toBeGreaterThan(0);
    expect(de({ ...base(), config: padrao }, "B").fatores.counterLiquidoLogit).toBeLessThan(0);
    const semBonus = comConfig((c) => { semTeto(c); c.forcas.counter = 0; });
    expect(de({ ...base(), config: semBonus }, "A").fatores.counterLiquidoLogit).toBe(0);
    expect(de({ ...base(), config: semBonus }, "B").fatores.counterLiquidoLogit).toBe(de({ ...base(), config: padrao }, "B").fatores.counterLiquidoLogit);
    const semDesbonus = comConfig((c) => { semTeto(c); c.forcas.counterado = 0; });
    expect(de({ ...base(), config: semDesbonus }, "B").fatores.counterLiquidoLogit).toBe(0);
    expect(de({ ...base(), config: semDesbonus }, "A").fatores.counterLiquidoLogit).toBe(de({ ...base(), config: padrao }, "A").fatores.counterLiquidoLogit);
  });

  it("o cartão reparte o counter em bônus e desbônus, somando o total", () => {
    const config = comConfig(semTeto);
    for (const id of ["A", "B"]) {
      const r = de({ ...base(), config }, id);
      const { counter, counterado } = r.detalhesPercentuais!;
      expect(counter + counterado).toBeCloseTo(r.fatoresPercentuais!.counterLiquidoLogit, 6);
    }
    expect(de({ ...base(), config }, "A").detalhesPercentuais!.counter).toBeGreaterThan(0);
    expect(de({ ...base(), config }, "B").detalhesPercentuais!.counterado).toBeLessThan(0);
  });

  it("hard-counter: a penalização, o veto e a marca «não recomendado» são independentes", () => {
    const padrao = comConfig(semTeto);
    const b = de({ ...base(), config: padrao }, "B");
    expect(b.bloqueado).toBe("hard-counter");
    expect(b.fatores.penalidadeHardCounterLogit).toBeLessThan(0);
    const semMarca = de({ ...base(), config: comConfig((c) => { semTeto(c); c.hardCounter.bloquear = 0; }) }, "B");
    expect(semMarca.bloqueado).toBeUndefined();
    expect(semMarca.alertaHardCounter).toBeUndefined();
    expect(semMarca.fatores.penalidadeHardCounterLogit).toBe(b.fatores.penalidadeHardCounterLogit);
    const semPenalidade = de({ ...base(), config: comConfig((c) => { semTeto(c); c.forcas.hardCounter = 0; }) }, "B");
    expect(semPenalidade.fatores.penalidadeHardCounterLogit).toBe(0);
    const semVeto = de({ ...base(), config: comConfig((c) => { semTeto(c); c.hardCounter.veto = 0; }) }, "B");
    expect(semVeto.fatores.penalidadeHardCounterLogit).toBeCloseTo(b.fatores.penalidadeHardCounterLogit + 0.65, 9);
  });

  it("counter já coberto: um aliado que já countera o inimigo corta o bônus repetido", () => {
    const p = cenario({ turno: 6, inimigosIds: ["E"], aliadosIds: ["X"], confrontos: { ...confrontos, [chaves("X", "E")]: par(0.8) } });
    const padrao = de({ ...p, config: comConfig(semTeto) }, "A").fatores.counterLiquidoLogit;
    const cortado = de({ ...p, config: comConfig((c) => { semTeto(c); c.counter.coberto = 0.5; }) }, "A").fatores.counterLiquidoLogit;
    expect(cortado).toBeCloseTo(padrao * 0.5, 9);
    // Sem aliado que o cubra, nada muda.
    const sozinho = cenario({ turno: 6, inimigosIds: ["E"], confrontos });
    expect(de({ ...sozinho, config: comConfig((c) => { semTeto(c); c.counter.coberto = 0.5; }) }, "A").fatores.counterLiquidoLogit).toBeCloseTo(de({ ...sozinho, config: comConfig(semTeto) }, "A").fatores.counterLiquidoLogit, 12);
  });

  it("counter já coberto não corta quem responde a dois inimigos", () => {
    const p = cenario({ turno: 6, inimigosIds: ["E", "X"], aliadosIds: ["C"], confrontos: { [chaves("A", "E")]: par(0.8), [chaves("A", "X")]: par(0.8), [chaves("C", "E")]: par(0.8) } });
    const a = de({ ...p, config: comConfig(semTeto) }, "A").fatores.counterLiquidoLogit;
    expect(de({ ...p, config: comConfig((c) => { semTeto(c); c.counter.coberto = 1; }) }, "A").fatores.counterLiquidoLogit).toBeCloseTo(a, 12);
  });

  it("pressão por aliado: o inimigo que countera o candidato e um aliado agrava o desbônus", () => {
    const p = cenario({ turno: 6, inimigosIds: ["E"], aliadosIds: ["X"], confrontos: { ...confrontos, [chaves("E", "X")]: par(0.8) } });
    const padrao = de({ ...p, config: comConfig(semTeto) }, "B").fatores.counterLiquidoLogit;
    const agravado = de({ ...p, config: comConfig((c) => { semTeto(c); c.counter.pressaoPorAliado = 1; }) }, "B").fatores.counterLiquidoLogit;
    expect(agravado).toBeCloseTo(padrao * 2, 9);
  });

  it("bans: o caminho livre desliga-se pela força, pelo peso e pelo teto", () => {
    const p = cenario({ turno: 1, banidosIds: ["Z"], disponiveisIds: ["A", "B", "C"], wrs: { A: 0.6 }, confrontos: { [chaves("A", "Z")]: par(0.2) } });
    expect(de({ ...p, config: configDeFabrica() }, "A").fatores.alivioBanLogit).toBeGreaterThan(0);
    for (const alterar of [(c: ConfigDoMotorApi) => { c.forcas.alivioBan = 0; }, (c: ConfigDoMotorApi) => { c.bans.peso = 0; }, (c: ConfigDoMotorApi) => { c.bans.tetoAlivio = 0; }])
      expect(de({ ...p, config: comConfig(alterar) }, "A").fatores.alivioBanLogit).toBe(0);
    expect(de({ ...p, config: comConfig((c) => { c.forcas.alivioBan = 2; }) }, "A").fatores.alivioBanLogit).toBeCloseTo(2 * de({ ...p, config: configDeFabrica() }, "A").fatores.alivioBanLogit, 12);
  });

  it("equilíbrio da equipa: a mesma classe só pesa se a regra estiver ligada", () => {
    const p = cenario({ turno: 3, aliadosIds: ["X"], perfisTaticos: Object.fromEntries(["A", "B", "C", "E", "X", "Z"].map((id) => [id, perfil(id, id === "A" || id === "X" ? "controller" : "damage")])) });
    const padrao = comConfig(semTeto);
    const diferenca = (config: ConfigDoMotorApi) => de({ ...p, config }, "B").fatores.penalidadeTaticaLogit - de({ ...p, config }, "A").fatores.penalidadeTaticaLogit;
    expect(diferenca(padrao)).toBeGreaterThan(0.1);
    expect(diferenca(comConfig((c) => { semTeto(c); c.composicao.classe = 0; }))).toBeCloseTo(0, 9);
    expect(de({ ...p, config: comConfig((c) => { semTeto(c); c.forcas.composicao = 0; }) }, "A").fatores.penalidadeTaticaLogit).toBeCloseTo(0, 12);
  });

  it("nichos e fora do grupo viável: bloquear ou só penalizar", () => {
    const p = cenario({ disponiveisIds: ["A", "B", "Z"], usos: { Z: 0.005 } });
    expect(de({ ...p, config: configDeFabrica() }, "Z").bloqueado).toBe("nicho");
    expect(de({ ...p, config: comConfig((c) => { c.viabilidade.bloquearNicho = 0; }) }, "Z").bloqueado).toBe("mapa");
    expect(de({ ...p, config: comConfig((c) => { c.viabilidade.bloquearNicho = 0; c.viabilidade.bloquearForaDoMapa = 0; }) }, "Z").bloqueado).toBeUndefined();
    expect(de({ ...p, config: comConfig((c) => { c.viabilidade.nichoUso = 0; }) }, "Z").bloqueado).toBe("mapa");
  });

  it("a distribuição do pick muda a força do mapa e o peso dos counters", () => {
    const p = cenario({ turno: 5, inimigosIds: ["E"], confrontos });
    const normal = de({ ...p, config: configDeFabrica() }, "A");
    const soCounter = de({ ...p, config: comConfig((c) => { c.picks[4] = { vitoria: 0, uso: 0, counter: 100, sinergia: 0 }; }) }, "A");
    expect(soCounter.fatores.forcaMapaLogit).toBe(0);
    expect(soCounter.pesosDoPick).toMatchObject({ mapa: 0, counter: 1 });
    expect(normal.pesosDoPick!.mapa).toBeGreaterThan(0.5);
    const soVitoria = de({ ...p, config: comConfig((c) => { c.picks[4] = { vitoria: 80, uso: 0, counter: 20, sinergia: 0 }; }) }, "A");
    expect(soVitoria.pesosDoPick).toMatchObject({ vitoria: 1, uso: 0 });
  });

  it("a confiança do counter: com menos jogos imaginários, poucos jogos já pesam", () => {
    const p = cenario({ turno: 6, inimigosIds: ["E"], confrontos: { [chaves("A", "E")]: par(0.9, 4) } });
    const k = (counter: number) => de({ ...p, config: comConfig((c) => { semTeto(c); c.confianca.counter = counter; }) }, "A").fatores.counterLiquidoLogit;
    expect(k(1)).toBeGreaterThan(k(15) * 2);
  });

  it("o teto dos bônus por pick limita a soma e pode desligar-se", () => {
    // A é o melhor do mapa: só quem lidera tem capacidade para somar bônus.
    const p = cenario({ turno: 2, inimigosIds: ["E"], wrs: { A: 0.65 }, usos: { A: 0.2 }, confrontos: { [chaves("A", "E")]: par(0.99, 500) } });
    const com = de({ ...p, config: configDeFabrica() }, "A").fatores.counterLiquidoLogit;
    const sem = de({ ...p, config: comConfig(semTeto) }, "A").fatores.counterLiquidoLogit;
    expect(com).toBeGreaterThan(0);
    expect(sem).toBeGreaterThan(com);
    const apertado = de({ ...p, config: comConfig((c) => { c.tetoDosBonus.proporcao[1] = 0.05; }) }, "A").fatores.counterLiquidoLogit;
    expect(apertado).toBeLessThan(com);
  });

  it("os bans sugeridos usam o expoente e o peso da ameaça configurados", () => {
    const base = { disponiveisIds: ["A", "B"], estatisticasMapa: { A: stats("A", 0.2, 0.6), B: stats("B", 0.05, 0.55) }, obterConfronto: () => undefined };
    const pontos = (config?: ConfigDoMotorApi) => Object.fromEntries(recomendarBansApi({ ...base, config }).map((b) => [b.brawlerId, b.banScore]));
    const padrao = pontos();
    expect(pontos(configDeFabrica())).toEqual(padrao);
    const semPresenca = pontos(comConfig((c) => { c.bansSugeridos.expoentePresenca = 0; }));
    expect(semPresenca.A / semPresenca.B).toBeLessThan(padrao.A / padrao.B);
  });
});
