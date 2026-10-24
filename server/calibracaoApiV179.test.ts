import { describe, expect, it } from "vitest";
import { pesosDoPickApi, defaultDraftRuleSettings } from "../shared/draftRules";
import {
  avaliarForcaDoMapa,
  calcularDeltaCounterPuro,
  calcularDeltaSinergiaPura,
  calcularDeltaSinergiaTripla,
  calcularProbabilidadeParBayesiana,
  logit,
  ranquearCandidatosApiPerfeito,
  type ConfrontoObservado,
  type ParametrosMotorApi,
  type PerfilTaticoBrawler,
} from "../shared/motorApiPerfeito";
import { calcularWinRateBayesiano } from "../shared/amostraPequena";
import { montarDadosDoMotorApi } from "../shared/observedMatchupMatrix";
import { orderDraftEntries, rankDraftEntries } from "../shared/draft";
import { mapaApiDoCatalogo } from "./fixtures/mapaApi";

const par = (p: number, n: number): ConfrontoObservado => ({
  jogosMapa: n,
  vitoriasA: p * n,
  jogosModo: n,
  vitoriasAModo: p * n,
});
const ids = ["A", "B", "C", "D", "L", "M", "X", "Y", "Z"];
const perfil = (id: string): PerfilTaticoBrawler => ({
  id,
  role: ["A", "B", "C", "L"].includes(id) ? "mid" : "side",
  classe: "controller",
  isAntiTank: true,
  isHeistDps: true,
});
const contexto = (): ParametrosMotorApi => ({
  disponiveisIds: ids,
  aliadosIds: [],
  inimigosIds: [],
  modoDeJogo: "heist",
  turno: 4,
  estatisticasMapa: Object.fromEntries(
    ids.map(id => [
      id,
      {
        brawlerId: id,
        jogosMapa: 1000,
        vitoriasMapa: id === "B" ? 550 : 600,
        jogosModo: 1000,
        vitoriasModo: 500,
        taxaUsoMapa: id === "B" ? 0.2 : 0.1,
      },
    ])
  ),
  perfisTaticos: Object.fromEntries(ids.map(id => [id, perfil(id)])),
  obterConfronto: () => undefined,
  obterSinergia: () => undefined,
  obterCounterDeReserva: (a, b) =>
    a === "A" && b === "B" ? -0.7 : a === "B" && b === "A" ? 0.7 : 0,
});
const achar = (p: ParametrosMotorApi, id = "A") =>
  ranquearCandidatosApiPerfeito(p).find(r => r.brawlerId === id)!;

describe("v179: vitória/uso e participação global por pick", () => {
  it("usa exatamente 70/30 → 95/5, reduzindo a participação global do mapa", () => {
    const pesos = [1, 2, 3, 4, 5, 6].map(n => pesosDoPickApi(n));
    expect(pesos.map(p => p.vitoria)).toEqual([
      0.7, 0.75, 0.8, 0.85, 0.9, 0.95,
    ]);
    for (let i = 0; i < 6; i++) {
      expect(pesos[i].vitoria + pesos[i].uso).toBeCloseTo(1);
      expect(pesos[i].mapa + pesos[i].counter + pesos[i].sinergia).toBeCloseTo(
        1
      );
      if (i) {
        expect(pesos[i].mapa).toBeLessThan(pesos[i - 1].mapa);
        expect(pesos[i].counter).toBeGreaterThan(pesos[i - 1].counter);
        expect(pesos[i].sinergia).toBeGreaterThan(pesos[i - 1].sinergia);
      }
    }
  });
  it("a mistura no motor usa os mesmos pesos e premia uso acima da média", () => {
    const p = contexto();
    p.estatisticasMapa.B.vitoriasMapa = 600;
    for (const turno of [1, 6]) {
      const r = avaliarForcaDoMapa(p.estatisticasMapa, turno);
      const a = r.mapa.A,
        b = r.mapa.B;
      expect(b.forca).toBeGreaterThan(a.forca);
      expect(a.forca).toBeCloseTo(
        r.pesos.vitoria * a.sinalVitoria + r.pesos.uso * a.sinalUso
      );
    }
    const primeiro = avaliarForcaDoMapa(p.estatisticasMapa, 1).mapa;
    const ultimo = avaliarForcaDoMapa(p.estatisticasMapa, 6).mapa;
    expect(primeiro.B.forca - primeiro.A.forca).toBeCloseTo(
      6 * (ultimo.B.forca - ultimo.A.forca)
    );
  });
  it("Melhores no mapa também respeita vitória/uso ao mudar o pick", () => {
    const modelo = montarDadosDoMotorApi(ids, {
      partidas: 2000,
      brawlers: ids.map(brawler => ({
        brawler,
        jogos: brawler === "B" ? 2000 : 1000,
        // O uso decide entre vitórias próximas (59% e 60%), sem superar uma
        // diferença grande de desempenho após o ajuste de escala da v180.
        vitorias: brawler === "B" ? 1180 : 600,
      })),
      confrontos: [],
      sinergias: [],
    });
    const rows = ids.map(brawler => ({
      brawler,
      score: 60,
      tier: "A" as const,
    }));
    const ordenar = (pickNumber: number) =>
      orderDraftEntries(
        rankDraftEntries(rows, new Set(), "", "Todos", {
          dadosApi: modelo,
          pickNumber,
        }),
        "base"
      );
    expect(ordenar(1)[0].row.brawler).toBe("B");
    expect(ordenar(6)[0].row.brawler).not.toBe("B");
  });
  it("regras personalizadas atravessam a integração real do Draft", () => {
    const p = contexto();
    const modelo = montarDadosDoMotorApi(
      ids,
      {
        partidas: 1500,
        brawlers: ids.map(brawler => ({ brawler, jogos: 1000, vitorias: 600 })),
        confrontos: [],
        sinergias: [],
      },
      { obterCounterDeReserva: p.obterCounterDeReserva }
    );
    const rows = ids.map(brawler => ({
      brawler,
      score: 60,
      tier: "A" as const,
    }));
    const lista = rankDraftEntries(rows, new Set(["B"]), "", "Todos", {
      dadosApi: modelo,
      bannedNames: ["B"],
      pickNumber: 4,
      ruleSettings: { ...defaultDraftRuleSettings, winRatePick4: 0.91 },
    });
    const a = lista.find(r => r.row.brawler === "A")!.api!;
    expect(a.pesosDoPick!.vitoria).toBe(0.91);
    expect(a.fatores.alivioBanLogit).toBeGreaterThan(0);
    expect(lista.some(r => r.row.brawler === "B")).toBe(false);
  });
});

describe("v179: confiança sem amortecimento duplicado", () => {
  it("um counter tem confiança N/(N+15), com o complemento da matriz", () => {
    const reserva = 0.6,
      n = 4,
      raw = logit(0.85);
    const c = calcularProbabilidadeParBayesiana(par(0.85, n), 0.5);
    expect(c.confianca).toBeCloseTo(4 / 19);
    expect(calcularDeltaCounterPuro(0, 0, par(0.85, n), reserva)).toBeCloseTo(
      (4 / 19) * raw + (15 / 19) * reserva - 0.01
    );
    expect(calcularDeltaCounterPuro(0, 0, par(0.85, 80))).toBeGreaterThan(
      calcularDeltaCounterPuro(0, 0, par(0.85, 4))
    );
    expect(calcularDeltaCounterPuro(0, 0, undefined, reserva)).toBeCloseTo(
      reserva - 0.01
    );
  });
  it("duplas e trios têm confiança mais rigorosa, de 25 e 40 jogos", () => {
    const n = 5,
      raw = logit(0.85);
    expect(calcularDeltaSinergiaPura(0, 0, par(0.85, n))).toBeCloseTo(
      (n / (n + 25)) * raw - 0.01
    );
    expect(
      calcularDeltaSinergiaTripla([0, 0, 0], [0, 0, 0], par(0.85, n))
    ).toBeCloseTo((n / (n + 40)) * raw - 0.01);
    expect(calcularDeltaSinergiaPura(0, 0, par(0.85, n))).toBeLessThan(
      calcularDeltaCounterPuro(0, 0, par(0.85, n))
    );
    const modelo = montarDadosDoMotorApi(["A", "B", "C"], {
      partidas: 10,
      brawlers: [],
      confrontos: [{ a: "A", b: "B", jogos: 5, vitorias: 4 }],
      sinergias: [{ a: "A", b: "B", jogos: 5, vitorias: 4 }],
      equipas: [{ membros: ["A", "B", "C"], jogos: 5, vitorias: 4 }],
    });
    expect(modelo.obterConfronto("A", "B")!.jogosPrior).toBe(15);
    expect(modelo.obterSinergia("A", "B")!.jogosPrior).toBe(25);
    expect(modelo.obterTrio(["A", "B", "C"])!.jogosPrior).toBe(40);
  });
  it("poucos jogos isolados não bastam para veto ou desbloqueio de nicho", () => {
    const p = contexto();
    const contra = (n: number) =>
      achar({
        ...p,
        inimigosIds: ["B"],
        obterCounterDeReserva: () => undefined,
        obterConfronto: (a, b) =>
          a === "A" && b === "B" ? par(0.15, n) : undefined,
      });
    expect(contra(4).alertaHardCounter).toBeUndefined();
    expect(contra(80).alertaHardCounter).toContain("B");
    p.estatisticasMapa.A.taxaUsoMapa = 0.001;
    const nicho = (n: number) =>
      achar({
        ...p,
        turno: 6,
        inimigosIds: ["X", "Y"],
        obterCounterDeReserva: () => undefined,
        obterConfronto: (a, b) =>
          a === "A" && ["X", "Y"].includes(b) ? par(0.95, n) : undefined,
      });
    expect(nicho(4).bloqueado).toBe("nicho");
    expect(nicho(80).bloqueado).toBeUndefined();
  });
  it("quatro vitórias isoladas não viram S-tier nem importam vitórias do modo", () => {
    const s = {
      jogosMapa: 4,
      vitoriasMapa: 4,
      jogosModo: 10000,
      vitoriasModo: 9999,
      razaoUsoMapa: 0.05,
    };
    expect(calcularWinRateBayesiano(s)).toBeLessThan(0.5);
    expect(calcularWinRateBayesiano({ ...s, vitoriasModo: 1 })).toBe(
      calcularWinRateBayesiano(s)
    );
  });
  it("abaixo de 47% só recebe 20% do bônus positivo de sinergia", () => {
    const a = logit(0.465);
    expect(calcularDeltaSinergiaPura(a, -a, par(0.8, 80))).toBeCloseTo(
      0.2 * calcularDeltaSinergiaPura(0, 0, par(0.8, 80))
    );
  });
});

describe("v179: influência de bans", () => {
  it("retira a ameaça, libera o candidato e não repete bans duplicados", () => {
    const p = contexto();
    const antes = achar(p),
      depois = achar({ ...p, banidosIds: ["B"] });
    expect(depois.fatores.alivioBanLogit).toBeGreaterThan(0);
    expect(depois.bansQueLiberam).toEqual(["B"]);
    expect(depois.winProbability).toBeGreaterThan(antes.winProbability);
    expect(depois.piorRespostaFuturaInimiga).not.toBe("B");
    expect(achar({ ...p, banidosIds: ["B", "B"] }).fatores).toEqual(
      depois.fatores
    );
    expect(
      ranquearCandidatosApiPerfeito({ ...p, banidosIds: ["B"] }).some(
        r => r.brawlerId === "B"
      )
    ).toBe(false);
  });
  it("alívio e escassez decaem exatamente com 3, 2, 1 e 0 escolhas inimigas restantes", () => {
    const p = { ...contexto(), banidosIds: ["B"] };
    const rs = [0, 1, 2, 3].map(n =>
      achar({ ...p, inimigosIds: ["X", "Y", "Z"].slice(0, n) })
    );
    expect(rs[0].fatores.alivioBanLogit).toBeGreaterThan(0);
    expect(rs[0].fatores.escassezFuncaoLogit).toBeGreaterThan(0);
    for (const k of ["alivioBanLogit", "escassezFuncaoLogit"] as const)
      for (let n = 0; n < 4; n++)
        expect(rs[n].fatores[k]).toBeCloseTo((rs[0].fatores[k] * (3 - n)) / 3);
    expect(rs[3].bansQueLiberam).toBeUndefined();
    expect(rs[3].funcaoEscassa).toBeUndefined();
  });
  it("com três inimigos, todos os fatores dos candidatos restantes ficam idênticos com ou sem bans", () => {
    const p = {
      ...contexto(),
      turno: 6,
      aliadosIds: ["L", "M"],
      inimigosIds: ["X", "Y", "Z"],
    };
    const antes = ranquearCandidatosApiPerfeito(p),
      depois = ranquearCandidatosApiPerfeito({ ...p, banidosIds: ["B", "C"] });
    for (const r of depois) {
      const a = antes.find(x => x.brawlerId === r.brawlerId)!;
      expect(r.fatores).toEqual(a.fatores);
      expect(r.winProbability).toBe(a.winProbability);
    }
  });
  it("uma função já preenchida não recebe bônus de escassez", () => {
    expect(
      achar({ ...contexto(), banidosIds: ["B"], aliadosIds: ["L"] }).fatores
        .escassezFuncaoLogit
    ).toBe(0);
  });
  it("bans de ameaça rara não geram alívio de meta nem escassez", () => {
    const p = contexto();
    p.estatisticasMapa.B.taxaUsoMapa = 0.001;
    const r = achar({ ...p, banidosIds: ["B"] });
    expect(r.fatores.alivioBanLogit).toBe(0);
    expect(r.fatores.escassezFuncaoLogit).toBe(0);
  });
  it("bans não desbloqueiam escolhas incompatíveis nem dão bônus por falta de dados", () => {
    const { parametros } = mapaApiDoCatalogo("Bridge Too Far");
    const r = achar(
      {
        ...parametros,
        banidosIds: ["Piper"],
        obterCounterDeReserva: (a, b) =>
          a === "Bull" && b === "Piper" ? -2 : 0,
      },
      "Bull"
    );
    expect(r.bloqueado).toBeDefined();
    expect(r.fatores.alivioBanLogit).toBe(0);
    expect(r.fatores.riscoMinimaxLogit).toBeLessThanOrEqual(0);
  });
});
