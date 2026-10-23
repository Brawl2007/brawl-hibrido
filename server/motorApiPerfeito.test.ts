import { getCounterProfile, calculateDraftSignal } from "../shared/draft";
import { getMatchupValue } from "../shared/counterMatchupValue";
import { setCounterSyncSnapshot } from "../shared/counterSourceRelations";
import { describe, expect, it } from "vitest";
import {
  ajustarForcaMapaPorUsoETurno,
  aplicarFiltroRuido,
  calcularDeltaCounterPuro,
  calcularDeltaSinergiaPura,
  calcularDeltaSinergiaTripla,
  calcularMelhoresLanes3v3,
  calcularPenalidadeTaticaDinamica,
  calcularPesoPartidaObservada,
  calcularWinRateBayesiano,
  logit,
  ranquearCandidatosApiPerfeito,
  recomendarBansApi,
  sigmoid,
  type ConfrontoObservado,
  type EstatisticasApiMapa,
  type PerfilTaticoBrawler,
} from "../shared/motorApiPerfeito";
import { criarResumoDasPartidas } from "../shared/partidasObservadas";
import { montarDadosDoMotorApi } from "../shared/observedMatchupMatrix";
import { rankDraftEntries, perfisTaticosDoDraft } from "../shared/draft";
import {
  redistribuirPesosPL,
  PESOS_PL_PRODIGY,
  penalidadeBravosDisponiveis,
} from "../shared/motoresDoDraft";
import {
  defaultDraftRuleSettings,
  getStarPlayerPickWeight,
} from "../shared/draftRules";

const agora = Date.parse("2026-10-22T12:00:00Z");
const stats = (id: string, uso = 0.1, wr = 0.5): EstatisticasApiMapa => ({
  brawlerId: id,
  jogosMapa: 1000,
  vitoriasMapa: wr * 1000,
  jogosModo: 2000,
  vitoriasModo: wr * 2000,
  taxaUsoMapa: uso,
});
const par = (wins: number, n = 1000): ConfrontoObservado => ({
  jogosMapa: n,
  vitoriasA: wins * n,
  jogosModo: n * 2,
  vitoriasAModo: wins * n * 2,
});
const perfil = (
  id: string,
  classe: PerfilTaticoBrawler["classe"] = "damage"
): PerfilTaticoBrawler => ({ id, role: "flex", classe, isAntiTank: true });
const parametros = () => ({
  disponiveisIds: ["A", "B", "C"],
  aliadosIds: [] as string[],
  inimigosIds: [] as string[],
  modoDeJogo: "knockout",
  estatisticasMapa: { A: stats("A"), B: stats("B"), C: stats("C") },
  obterConfronto: (_a: string, _b: string): ConfrontoObservado | undefined =>
    undefined,
  obterSinergia: (_a: string, _b: string): ConfrontoObservado | undefined =>
    undefined,
  perfisTaticos: { A: perfil("A"), B: perfil("B"), C: perfil("C") },
});

describe("motor oficial bayesiano V1–V3", () => {
  it("pondera elo, nível e meia-vida; nunca dá peso a datas inválidas", () => {
    const p = {
      battleTimeIso: new Date(agora).toISOString(),
      eloMedioRank: "mestre" as const,
      todosNivel11: true,
    };
    expect(calcularPesoPartidaObservada(p, agora)).toBe(3);
    expect(
      calcularPesoPartidaObservada({ ...p, todosNivel11: false }, agora)
    ).toBeCloseTo(0.45);
    expect(
      calcularPesoPartidaObservada({ ...p, eloMedioRank: "lendario" }, agora)
    ).toBe(1.8);
    expect(
      calcularPesoPartidaObservada({ ...p, eloMedioRank: "mitico" }, agora)
    ).toBe(1);
    expect(
      calcularPesoPartidaObservada({ ...p, eloMedioRank: "abaixo" }, agora)
    ).toBe(0.35);
    expect(
      calcularPesoPartidaObservada(
        { ...p, battleTimeIso: new Date(agora - 14 * 86400000).toISOString() },
        agora
      )
    ).toBe(1.5);
    expect(
      calcularPesoPartidaObservada({ ...p, battleTimeIso: "inválida" }, agora)
    ).toBe(0);
  });
  it("suaviza em três níveis e mantém probabilidades finitas", () => {
    expect(
      calcularWinRateBayesiano({
        ...stats("A"),
        jogosMapa: 0,
        vitoriasMapa: 0,
        jogosModo: 0,
        vitoriasModo: 0,
      })
    ).toBe(0.5);
    const s = {
      ...stats("A"),
      jogosModo: 100,
      vitoriasModo: 70,
      jogosMapa: 5,
      vitoriasMapa: 5,
    };
    expect(calcularWinRateBayesiano(s)).toBeCloseTo(
      (5 + 30 * (90 / 140) + 10) / 55
    );
    expect(logit(0)).toBeCloseTo(Math.log(0.02 / 0.98));
    expect(sigmoid(logit(0.6))).toBeCloseTo(0.6);
  });
  it("amortece bons especialistas na abertura sem melhorar uma força negativa", () => {
    expect(
      ajustarForcaMapaPorUsoETurno(0.8, 0.003, 1).betaAjustado
    ).toBeLessThan(ajustarForcaMapaPorUsoETurno(0.8, 0.003, 6).betaAjustado);
    expect(ajustarForcaMapaPorUsoETurno(-0.3, 0, 1).betaAjustado).toBe(-0.3);
  });
  it("zera pares sem evidência suficiente e tira a força individual do confronto", () => {
    expect(calcularDeltaCounterPuro(0, 0, undefined)).toBe(0);
    expect(calcularDeltaCounterPuro(0, 0, par(1, 3))).toBe(0);
    expect(calcularDeltaCounterPuro(0, 0, par(0.8, 20))).toBeLessThan(
      calcularDeltaCounterPuro(0, 0, par(0.8))
    );
    const a = logit(0.65),
      b = logit(0.5);
    expect(calcularDeltaCounterPuro(a, b, par(sigmoid(a - b)))).toBe(0);
    expect(aplicarFiltroRuido(0.059)).toBe(0);
  });
  it("não paga sinergia de força individual e aplica a trava anti-carona", () => {
    expect(
      calcularDeltaSinergiaPura(
        logit(0.6),
        logit(0.7),
        par(sigmoid(logit(0.6) + logit(0.7)))
      )
    ).toBe(0);
    const forte = calcularDeltaSinergiaPura(0, 0, par(0.8));
    const fraco = calcularDeltaSinergiaPura(-0.2, 0.2, par(0.8));
    expect(fraco).toBeCloseTo(forte * 0.3);
    expect(calcularDeltaSinergiaTripla([0, 0, 0], [0, 0, 0], par(1, 2))).toBe(
      0
    );
  });
  it("veta o hard-counter revelado, exclui picks, respeita pool e soma os sete fatores", () => {
    const p = parametros();
    const r = ranquearCandidatosApiPerfeito({
      ...p,
      inimigosIds: ["C"],
      obterConfronto: (a, b) =>
        a === "A" && b === "C" ? par(0.05) : undefined,
    });
    expect(r.some(r => r.brawlerId === "C")).toBe(false);
    const a = r.find(r => r.brawlerId === "A")!;
    expect(a.alertaHardCounter).toContain("C");
    expect(a.fatores.penalidadeHardCounterLogit).toBeLessThan(-0.65);
    expect(a.logOddsFinal).toBeCloseTo(
      Object.values(a.fatores).reduce((a, b) => a + b, 0)
    );
    expect(a.winProbability).toBeCloseTo(sigmoid(a.logOddsFinal) * 100, 1);
    expect(r[0].brawlerId).toBe("B");
    expect(
      ranquearCandidatosApiPerfeito({ ...p, poolNivel11Usuario: new Set() })
    ).toEqual([]);
    expect(
      ranquearCandidatosApiPerfeito({
        ...p,
        poolNivel11Usuario: new Set(["A"]),
      }).map(r => r.brawlerId)
    ).toEqual(["A"]);
  });
  it("só libera nichos no fecho com vantagem de counter comprovada", () => {
    const p = parametros();
    p.estatisticasMapa.A = stats("A", 0.005);
    const r = (turno: number, counter: boolean) =>
      ranquearCandidatosApiPerfeito({
        ...p,
        turno,
        inimigosIds: ["C"],
        obterConfronto: (a, b) =>
          counter && a === "A" && b === "C" ? par(0.8) : undefined,
      }).find(r => r.brawlerId === "A")!;
    expect(r(6, true).fatores.ajustePoucoUsoLogit).toBe(0);
    expect(r(6, false).fatores.ajustePoucoUsoLogit).toBe(-0.35);
    expect(r(1, true).fatores.ajustePoucoUsoLogit).toBe(-0.35);
  });
  it("considera risco de todos os disponíveis e elimina risco futuro com equipa inimiga completa", () => {
    const p = parametros();
    const risco = ranquearCandidatosApiPerfeito({
      ...p,
      obterConfronto: (a, b) => (a === "A" && b === "B" ? par(0.1) : undefined),
    }).find(r => r.brawlerId === "A")!;
    expect(risco.fatores.riscoMinimaxLogit).toBeLessThan(0);
    expect(risco.piorRespostaFuturaInimiga).toBeDefined();
    const fim = ranquearCandidatosApiPerfeito({
      ...p,
      disponiveisIds: ["A"],
      inimigosIds: ["X", "Y", "Z"],
    })[0];
    expect(fim.fatores.riscoMinimaxLogit).toBe(0);
    expect(fim.piorRespostaFuturaInimiga).toBeUndefined();
  });
  it("aplica conflitos de função, paredes, anti-tanque e dano ao cofre", () => {
    const perfis = {
      A: { ...perfil("A", "thrower"), role: "side" as const },
      B: { ...perfil("B", "sniper"), role: "side" as const, isAntiTank: false },
      C: { ...perfil("C", "tank"), isWallbreaker: true },
    };
    const p = {
      candidatoId: "A",
      aliadosIds: ["B"],
      inimigosIds: ["C"],
      modoDeJogo: "heist",
      perfis,
    };
    expect(calcularPenalidadeTaticaDinamica(p)).toBeGreaterThan(0.5);
    expect(
      calcularPenalidadeTaticaDinamica({
        ...p,
        modificadorRanked: "timed_detonation",
      })
    ).toBeGreaterThan(calcularPenalidadeTaticaDinamica(p));
  });
  it("atribui três lanes únicas com Mid correto e protege a escolha pretendida nos bans", () => {
    const ids = ["A", "B", "C", "X", "Y", "Z"];
    const estatisticasMapa = Object.fromEntries(ids.map(id => [id, stats(id)]));
    const perfis = Object.fromEntries(
      ids.map(id => [
        id,
        {
          ...perfil(id),
          role: id === "C" ? ("mid" as const) : ("side" as const),
        },
      ])
    );
    const lanes = calcularMelhoresLanes3v3({
      aliadosIds: ids.slice(0, 3),
      inimigosIds: ids.slice(3),
      estatisticasMapa,
      obterConfronto: (a, b) =>
        (a === "A" && b === "Y") ||
        (a === "B" && b === "Z") ||
        (a === "C" && b === "X")
          ? par(0.8)
          : par(0.5),
      perfisTaticos: perfis,
    });
    expect(new Set(lanes.map(l => l.inimigoId)).size).toBe(3);
    expect(lanes.find(l => l.posicaoSugerida === "Mid")?.aliadoId).toBe("C");
    expect(lanes.find(l => l.aliadoId === "A")?.inimigoId).toBe("Y");
    const bans = recomendarBansApi({
      disponiveisIds: ids,
      estatisticasMapa,
      brawlerPretendidoId: "A",
      obterConfronto: (a, b) => (a === "X" && b === "A" ? par(0.9) : undefined),
    });
    expect(bans[0].brawlerId).toBe("X");
    expect(bans.some(b => b.brawlerId === "A")).toBe(false);
  });
});

describe("agregação e ligação ao Draft", () => {
  it("preserva contagens, pesa por qualidade e usa priors por modo sem misturar mapas", () => {
    const resumo = criarResumoDasPartidas({ ponderar: true, agoraMs: agora });
    resumo.acrescentar([
      {
        mapId: "1",
        mode: "heist",
        vencedores: ["Colt", "Colette", "Brock"],
        derrotados: ["Bull", "Jessie", "Chuck"],
        battleTimeIso: new Date(agora).toISOString(),
        eloMedioRank: "mestre",
        todosNivel11: true,
      },
      {
        mapId: "2",
        mode: "heist",
        vencedores: ["Bull"],
        derrotados: ["Colt"],
        battleTimeIso: new Date(agora - 14 * 86400000).toISOString(),
        eloMedioRank: "mitico",
        todosNivel11: false,
      },
    ]);
    const r = resumo.terminar();
    expect(r.partidas).toBe(2);
    expect(r.partidasPonderadas).toBeCloseTo(3.075);
    expect(r.brawlers.find(b => b.brawler === "Colt")).toMatchObject({
      jogos: 2,
      vitorias: 1,
      jogosPonderados: 3.075,
      vitoriasPonderadas: 3,
    });
    const modelo = montarDadosDoMotorApi(["Colt", "Bull"], {
      partidas: 1,
      partidasPonderadas: 3,
      brawlers: r.brawlersPorMapa["1"],
      confrontos: [],
      sinergias: [],
      priorModo: {
        brawlers: r.brawlersPorModo.heist,
        confrontos: r.confrontosPorModo!.heist,
        sinergias: [],
      },
    });
    expect(modelo.estatisticasMapa.Colt.jogosMapa).toBe(3);
    expect(modelo.estatisticasMapa.Colt.jogosModo).toBeCloseTo(3.075);
    expect(modelo.obterConfronto("COLT", "BULL")?.jogosModo).toBeCloseTo(3.075);
    expect(modelo.obterConfronto("Colt", "Bull")?.jogosMapa).toBe(0);
    const rows = ["Colt", "Bull"].map(brawler => ({
      brawler,
      score: 1,
      tier: "A" as const,
    }));
    const ranking = rankDraftEntries(rows, new Set(["Bull"]), "", "Todos", {
      dadosApi: modelo,
      enemyRows: [rows[1]],
      pickNumber: 6,
    });
    expect(ranking).toHaveLength(1);
    expect(ranking[0].api?.turnoAtual).toBe(6);
    expect(ranking[0].finalPoints).toBe(ranking[0].api?.winProbability);
    expect(perfisTaticosDoDraft(["Colt"]).Colt.isWallbreaker).toBe(true);
  });
  it("redistribui o ban sem perder peso, aplica exposição cedo e aumenta Star Player em Roubo", () => {
    expect(redistribuirPesosPL(PESOS_PL_PRODIGY, 3)).toEqual({
      uso: 5,
      vitoria: 23,
      counter: 44,
      encaixe: 16,
      sinergia: 12,
      ban: 0,
    });
    expect(redistribuirPesosPL(PESOS_PL_PRODIGY, 2)).toEqual(PESOS_PL_PRODIGY);
    expect(penalidadeBravosDisponiveis([20, 10], 1, true)).toBe(15);
    expect(penalidadeBravosDisponiveis([20], 4, true)).toBe(0);
    expect(getStarPlayerPickWeight(1, defaultDraftRuleSettings, "heist")).toBe(
      0.18
    );
    expect(getStarPlayerPickWeight(1, defaultDraftRuleSettings, "bounty")).toBe(
      0.12
    );
  });
});

it("o Híbrido aplica o piso de 12% sem duplicar o delta e trava dois inimigos desfavoráveis", () => {
  setCounterSyncSnapshot(undefined, { allowOfflineFallback: true });
  try {
    const inimigos = getCounterProfile("Brock").counteredBy.filter((n) => { const d = getMatchupValue("Brock", n).total; return d < 0 && d > -12; }).slice(0, 2);
    expect(inimigos).toHaveLength(2);
    const row = { brawler: "Brock", score: 75, tier: "A" as const };
    const linhas = inimigos.map((brawler) => ({ ...row, brawler }));
    const contexto = { pickNumber: 1, ruleSettings: { missingMid: 0, missingSide: 0, openingLongRange: 0 } };
    const um = calculateDraftSignal(row, { ...contexto, enemyRows: linhas.slice(0, 1) });
    const dois = calculateDraftSignal(row, { ...contexto, enemyRows: linhas });
    expect(um.draftScore).toBeCloseTo(75 * .88);
    expect(dois.draftScore).toBeCloseTo(75 * (1 - .24 - .15));
  } finally { setCounterSyncSnapshot(undefined, { allowOfflineFallback: false }); }
});
