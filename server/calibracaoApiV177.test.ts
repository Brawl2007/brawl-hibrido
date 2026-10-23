import { afterEach, describe, expect, it } from "vitest";
import {
  calcularDeltaCounterPuro,
  calcularProbabilidadeParBayesiana,
  calcularMelhoresLanes3v3,
  falhasAoFecharEquipa,
  proximoTurnoDaEquipa,
  impactosPercentuais,
  logit,
  ranquearCandidatosApiPerfeito,
  recomendarBansApi,
  sigmoid,
  type ConfrontoObservado,
  type EstatisticasApiMapa,
  type ParametrosMotorApi,
  type PerfilTaticoBrawler,
} from "../shared/motorApiPerfeito";
import {
  definirFonteObservada,
  fontesDeApoioDaApi,
  getMatchupDasFontes,
  getMatchupValue,
  montarFonteObservada,
} from "../shared/counterMatchupValue";
import { montarDadosDoMotorApi } from "../shared/observedMatchupMatrix";
import { orderDraftEntries, rankDraftEntries } from "../shared/draft";

const stats = (id: string, uso = 0.1, wr = 0.5): EstatisticasApiMapa => ({
  brawlerId: id,
  jogosMapa: 1000,
  vitoriasMapa: wr * 1000,
  jogosModo: 2000,
  vitoriasModo: wr * 2000,
  taxaUsoMapa: uso,
});
const perfil = (
  id: string,
  role: PerfilTaticoBrawler["role"] = "mid"
): PerfilTaticoBrawler => ({
  id,
  role,
  classe: "controller",
  isAntiTank: true,
  isHeistDps: true,
});
const par = (wr: number, n = 3): ConfrontoObservado => ({
  jogosMapa: n,
  vitoriasA: wr * n,
  jogosModo: n,
  vitoriasAModo: wr * n,
});
const contexto = (): ParametrosMotorApi => ({
  disponiveisIds: ["A", "B", "C"],
  aliadosIds: [],
  inimigosIds: [],
  modoDeJogo: "heist",
  estatisticasMapa: {
    A: stats("A", 0.1, 0.6),
    B: stats("B", 0.1, 0.57),
    C: stats("C", 0.1, 0.54),
  },
  perfisTaticos: { A: perfil("A"), B: perfil("B"), C: perfil("C") },
  obterConfronto: () => undefined,
  obterSinergia: () => undefined,
});
afterEach(() => definirFonteObservada(null));

describe("calibração V177", () => {
  it("mantém o sinal de três jogos e mistura o apoio uma única vez", () => {
    const reserva = logit(0.7);
    expect(calcularDeltaCounterPuro(0, 0, undefined, reserva)).toBeCloseTo(
      reserva - 0.01
    );
    const pequeno = calcularDeltaCounterPuro(0, 0, par(0), reserva);
    expect(pequeno).toBeLessThan(reserva);
    expect(calcularDeltaCounterPuro(0, 0, par(1))).toBeGreaterThan(0.1);
    const grande = calcularDeltaCounterPuro(0, 0, par(0.3, 1000000), reserva);
    expect(grande).toBeCloseTo(
      calcularDeltaCounterPuro(0, 0, par(0.3, 1000000)),
      3
    );
    expect(grande).toBeLessThan(0);
  });
  it("não conta a amostra do mapa novamente dentro da amostra do modo", () => {
    expect(
      calcularProbabilidadeParBayesiana(par(0.6, 10), 0.5).amostraEfetiva
    ).toBe(10);
    expect(
      calcularProbabilidadeParBayesiana(
        { ...par(0.6, 10), jogosModo: 20, vitoriasAModo: 12 },
        0.5
      ).amostraEfetiva
    ).toBe(13.5);
  });
  it("usa quinze jogos de confiança para counter sem outro amortecedor", () => {
    const modelo = montarDadosDoMotorApi(["A", "B"], {
      partidas: 10,
      brawlers: [],
      sinergias: [],
      confrontos: [{ a: "A", b: "B", jogos: 3, vitorias: 2 }],
    });
    expect(modelo.obterConfronto("A", "B")?.jogosPrior).toBeCloseTo(
      15
    );
    expect(modelo.obterConfronto("A", "B")!.jogosPrior).toBe(15);
  });
  it("usa o catálogo por modo mesmo com a fonte da API ativa, sem recursão", () => {
    const antes = getMatchupDasFontes("Brock", "Barley", "knockout").total;
    expect(Math.abs(antes)).toBeGreaterThan(0);
    definirFonteObservada(
      montarFonteObservada({
        partidas: 0,
        partidasPonderadas: 0,
        brawlers: [],
        confrontos: [],
        sinergias: [],
        modeId: "knockout",
      })
    );
    const apoio = fontesDeApoioDaApi("knockout");
    expect(apoio.obterCounterDeReserva?.("Brock", "Barley")).not.toBe(0);
    expect(getMatchupDasFontes("Brock", "Barley", "knockout").total).toBe(
      antes
    );
    expect(getMatchupValue("Brock", "Barley", "knockout").total).not.toBe(0);
  });
  it("não muda o ranking nem as probabilidades ao converter a unidade do uso", () => {
    const p = contexto();
    p.estatisticasMapa.A.taxaUsoMapa = 0.03;
    const primeiro = ranquearCandidatosApiPerfeito(p);
    for (const escala of [6, 100]) {
      const outro = ranquearCandidatosApiPerfeito({
        ...p,
        estatisticasMapa: Object.fromEntries(
          Object.entries(p.estatisticasMapa).map(([k, s]) => [
            k,
            { ...s, taxaUsoMapa: s.taxaUsoMapa * escala },
          ])
        ),
      });
      expect(outro.map(r => r.brawlerId)).toEqual(
        primeiro.map(r => r.brawlerId)
      );
      expect(outro.map(r => r.winProbability)).toEqual(
        primeiro.map(r => r.winProbability)
      );
    }
  });
  it("preserva neutralidade sem evidência e centraliza o custo para premiar o pick seguro", () => {
    const p = contexto();
    p.estatisticasMapa = Object.fromEntries(
      ["A", "B", "C"].map(id => [id, stats(id)])
    );
    expect(ranquearCandidatosApiPerfeito(p).map(r => r.winProbability)).toEqual(
      [50, 50, 50]
    );
    const comRisco = ranquearCandidatosApiPerfeito({
      ...p,
      obterCounterDeReserva: (a, b) =>
        a === "A" && b === "B" ? -0.6 : a === "B" && b === "A" ? 0.6 : 0,
    });
    expect(
      comRisco.find(r => r.brawlerId === "A")!.fatores.riscoMinimaxLogit
    ).toBeLessThan(0);
    expect(
      comRisco.find(r => r.brawlerId === "C")!.fatores.riscoMinimaxLogit
    ).toBe(0);
    const melhores = ranquearCandidatosApiPerfeito(contexto());
    expect(melhores[0].winProbability).toBeGreaterThan(54);
    expect(melhores[0].winProbability).toBeLessThanOrEqual(72);
    for (const r of comRisco) {
      expect(Object.values(r.fatores).reduce((a, b) => a + b, 0)).toBeCloseTo(
        r.logOddsFinal
      );
      expect(
        50 +
          Object.values(impactosPercentuais(r.fatores)).reduce(
            (a, b) => a + b,
            0
          )
      ).toBeCloseTo(100 * sigmoid(r.logOddsFinal));
    }
  });
  it("reage a counters e exige mais volume para a sinergia mudar o líder", () => {
    const p = contexto();
    p.estatisticasMapa.B = stats("B", .1, .59);
    p.estatisticasMapa.C = stats("C", .1, .59);
    p.disponiveisIds.push("D");
    p.estatisticasMapa.D = stats("D", 0.1, 0.5);
    p.perfisTaticos.D = perfil("D");
    const antes = ranquearCandidatosApiPerfeito(p)[0].brawlerId;
    const depois = ranquearCandidatosApiPerfeito({
      ...p,
      inimigosIds: ["D"],
      obterConfronto: (a, b) =>
        a === "B" && b === "D" ? par(0.95) : undefined,
    });
    expect(antes).toBe("A");
    expect(depois[0].brawlerId).toBe("B");
    const comAliado = ranquearCandidatosApiPerfeito({
      ...p,
      aliadosIds: ["D"],
      obterSinergia: (a, b) => (a === "C" && b === "D" ? par(0.95) : undefined),
    });
    expect(comAliado[0].brawlerId).toBe("A");
    expect(comAliado.find(r=>r.brawlerId === "C")!.fatores.sinergiaRealLogit).toBeGreaterThan(0);
    const comVolume = ranquearCandidatosApiPerfeito({ ...p, turno: 6, aliadosIds: ["D"], obterSinergia: (a,b)=>a==="C"&&b==="D"?par(.95,80):undefined });
    expect(comVolume[0].brawlerId).toBe("C");
    expect(comVolume[0].melhorAliado).toBe("D");
  });
  it("nicho e hard-counter não furam o veto mesmo com vitória alta e sinergia extrema", () => {
    const p = contexto();
    p.estatisticasMapa.A = stats("A", 0.001, 0.95);
    p.disponiveisIds.push("D");
    p.estatisticasMapa.D = stats("D");
    p.perfisTaticos.D = perfil("D");
    const cedo = ranquearCandidatosApiPerfeito({
      ...p,
      turno: 1,
      aliadosIds: ["D"],
      obterSinergiaDeReserva: a => (a === "A" ? 3 : 0),
    });
    expect(cedo[0].brawlerId).not.toBe("A");
    expect(cedo.find(r => r.brawlerId === "A")!.bloqueado).toBe("nicho");
    const tarde = ranquearCandidatosApiPerfeito({
      ...p,
      turno: 6,
      inimigosIds: ["B", "D"],
      obterCounterDeReserva: (a, b) => (a === "A" && ["B", "D"].includes(b) ? 0.6 : 0),
    });
    expect(tarde.find(r => r.brawlerId === "A")!.bloqueado).toBeUndefined();
    const hard = ranquearCandidatosApiPerfeito({
      ...p,
      turno: 6,
      inimigosIds: ["D"],
      obterCounterDeReserva: a => (a === "A" ? -1 : 0),
    });
    expect(hard[0].brawlerId).not.toBe("A");
    expect(hard.find(r => r.brawlerId === "A")!.bloqueado).toBe("hard-counter");
  });
  it("faz o pareamento com Mid de ambos os lados mesmo se cruzar as lanes ganhasse mais counters", () => {
    const ids = ["A", "B", "C", "X", "Y", "Z"];
    const perfis = Object.fromEntries(
      ids.map(id => [id, perfil(id, id === "C" || id === "Z" ? "mid" : "side")])
    );
    const lanes = calcularMelhoresLanes3v3({
      aliadosIds: ["A", "B", "C"],
      inimigosIds: ["X", "Y", "Z"],
      estatisticasMapa: Object.fromEntries(ids.map(id => [id, stats(id)])),
      perfisTaticos: perfis,
      obterConfronto: () => undefined,
      obterCounterDeReserva: (a, b) =>
        (a === "A" && b === "Z") || (a === "C" && b === "X") ? 0.8 : 0,
    });
    expect(lanes.find(l => l.posicaoSugerida === "Mid")).toMatchObject({
      aliadoId: "C",
      inimigoId: "Z",
    });
    expect(new Set(lanes.map(l => l.inimigoId)).size).toBe(3);
  });
  it("respeita a sequência de dois picks da mesma equipa e mantém o veto na ordenação visual", () => {
    expect(
      [0, 1, 2, 3, 4, 5].map(n => proximoTurnoDaEquipa(n, "first_pick"))
    ).toEqual([1, 4, 4, 4, 5, undefined]);
    expect(
      [0, 1, 2, 3, 4, 5].map(n => proximoTurnoDaEquipa(n, "second_pick"))
    ).toEqual([2, 2, 3, 6, 6, 6]);
    const p = contexto();
    p.estatisticasMapa.A.taxaUsoMapa = 0.001;
    const modelo = montarDadosDoMotorApi(["A", "B", "C"], {
      partidas: 1000,
      brawlers: [
        { brawler: "A", jogos: 1, vitorias: 1 },
        { brawler: "B", jogos: 100, vitorias: 60 },
        { brawler: "C", jogos: 100, vitorias: 55 },
      ],
      confrontos: [],
      sinergias: [],
    });
    const rows = ["A", "B", "C"].map(brawler => ({
      brawler,
      score: brawler === "A" ? 100 : 50,
      tier: "A" as const,
    }));
    const lista = rankDraftEntries(rows, new Set(), "", "Todos", {
      dadosApi: modelo,
    });
    expect(orderDraftEntries(lista, "base")[0].row.brawler).not.toBe("A");
  });
  it("recusa fechar uma equipa sem Mid, anti-tanque ou dano ao cofre", () => {
    const perfis = {
      A: { ...perfil("A", "side"), isAntiTank: false, isHeistDps: false },
      B: { ...perfil("B", "side"), isAntiTank: false, isHeistDps: false },
      C: { ...perfil("C", "side"), isAntiTank: false, isHeistDps: false },
    };
    expect(falhasAoFecharEquipa(["A", "B", "C"], perfis, "heist")).toHaveLength(
      3
    );
    perfis.C = { ...perfil("C"), isAntiTank: true, isHeistDps: true };
    expect(falhasAoFecharEquipa(["A", "B", "C"], perfis, "heist")).toEqual([]);
  });
  it("protege o primeiro pick de um counter clássico sem jogos no mapa", () => {
    const bans = recomendarBansApi({
      disponiveisIds: ["A", "B", "C"],
      estatisticasMapa: { A: stats("A"), B: stats("B", 0), C: stats("C") },
      brawlerPretendidoId: "A",
      obterConfronto: () => undefined,
      obterCounterDeReserva: (a, b) => (a === "B" && b === "A" ? 0.8 : 0),
    });
    expect(bans[0].brawlerId).toBe("B");
    expect(bans[0].banScore).toBeGreaterThan(0);
  });
});
