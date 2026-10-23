import { fontesDeApoioDaApi } from "../shared/counterMatchupValue";
import { describe, expect, it } from "vitest";
import { calcularWinRateBayesiano } from "../shared/amostraPequena";
import {
  avaliarForcaDoMapa,
  calcularDeltaCounterPuro,
  logit,
  ranquearCandidatosApiPerfeito,
  type EstatisticasApiMapa,
  type ParametrosMotorApi,
} from "../shared/motorApiPerfeito";
import { criarReferenciasDoMapa } from "../shared/adequacaoAoMapa";
import { montarDadosDoMotorApi } from "../shared/observedMatchupMatrix";
import { fichaDoBrawler } from "../shared/fichaDaApi";
import { perfisTaticosDoDraft } from "../shared/draft";
import { mapaApiDoCatalogo } from "./fixtures/mapaApi";

const stats = (id: string, uso = 0.1, p = 0.55): EstatisticasApiMapa => ({
  brawlerId: id,
  taxaUsoMapa: uso,
  jogosMapa: 100,
  vitoriasMapa: 100 * p,
  jogosModo: 10000,
  vitoriasModo: 9000,
});
const contexto = (): ParametrosMotorApi => ({
  disponiveisIds: ["Piper", "Brock", "Colt", "Bull"],
  aliadosIds: [],
  inimigosIds: [],
  modoDeJogo: "knockout",
  turno: 1,
  estatisticasMapa: Object.fromEntries(
    ["Piper", "Brock", "Colt", "Bull"].map(id => [id, stats(id)])
  ),
  perfisTaticos: perfisTaticosDoDraft(["Piper", "Brock", "Colt", "Bull"]),
  obterConfronto: () => undefined,
  obterSinergia: () => undefined,
});

describe("v178: força e viabilidade próprias do mapa", () => {
  it("não importa o desempenho de outro terreno pelo prior do modo", () => {
    const base = {
      ...stats("Bull", 0),
      jogosMapa: 0,
      vitoriasMapa: 0,
      razaoUsoMapa: 0,
      referenciaMapa: {
        vitoria: 0.6,
        uso: 0,
        score: 0.9,
        adequacaoTerreno: 0.25,
      },
    };
    const alto = calcularWinRateBayesiano(base);
    expect(alto).toBeLessThanOrEqual(0.43);
    expect(calcularWinRateBayesiano({ ...base, vitoriasModo: 100 })).toBe(alto);
    expect(calcularWinRateBayesiano({ ...base, vitoriasModo: 10000 })).toBe(
      alto
    );
    const sniper = calcularWinRateBayesiano({
      ...stats("Piper", 0.2, 0.49),
      razaoUsoMapa: 2,
    });
    expect(sniper).toBeGreaterThan(alto);
  });
  it("preserva diferenças reais de mapa e não comprime fatores nem probabilidades em 72%", () => {
    const p = contexto();
    p.estatisticasMapa.Piper = stats("Piper", 0.3, 0.9);
    const forca = avaliarForcaDoMapa(p.estatisticasMapa).mapa.Piper.forca;
    const r = ranquearCandidatosApiPerfeito(p).find(
      r => r.brawlerId === "Piper"
    )!;
    expect(r.fatores.forcaMapaLogit).toBe(forca);
    expect(r.winProbability).toBeGreaterThan(72);
    expect(Object.values(r.fatores).reduce((a, b) => a + b, 0)).toBeCloseTo(
      r.logOddsFinal
    );
  });
  it.each([1, 2, 3])("a base domina os bônus positivos no pick %i", turno => {
    const p = contexto();
    p.estatisticasMapa.Piper = stats("Piper", 0.2, 0.6);
    const rs = ranquearCandidatosApiPerfeito({
      ...p,
      turno,
      aliadosIds: ["Colt"],
      inimigosIds: ["Bull"],
      obterCounterDeReserva: a => (a === "Piper" ? 2 : undefined),
      obterSinergiaDeReserva: () => 3,
    });
    const r = rs.find(r => r.brawlerId === "Piper")!;
    const bonus = Object.entries(r.fatores)
      .filter(([k]) => k !== "forcaMapaLogit")
      .reduce((s, [, v]) => s + Math.max(0, v), 0);
    expect(
      r.fatores.forcaMapaLogit / (r.fatores.forcaMapaLogit + bonus)
    ).toBeGreaterThanOrEqual(0.7 - 1e-10);
  });
  it("não premia segurança ou encaixe sem amostra, mesmo com referência popular", () => {
    const p = contexto();
    p.estatisticasMapa.Piper = {
      ...stats("Piper"),
      jogosMapa: 0,
      vitoriasMapa: 0,
      referenciaMapa: {
        vitoria: 0.6,
        uso: 10,
        score: 0.8,
        adequacaoTerreno: 1,
      },
    };
    const r = ranquearCandidatosApiPerfeito(p).find(
      r => r.brawlerId === "Piper"
    )!;
    expect(r.fatores.riscoMinimaxLogit).toBeLessThanOrEqual(0);
    expect(r.fatores.penalidadeTaticaLogit).toBeLessThanOrEqual(0);
    expect(r.fatores.ajustePoucoUsoLogit).toBeLessThanOrEqual(0);
  });
  it("mantém o Top 25 original depois de bans ou restrição da pool pessoal", () => {
    const nomes = Array.from({ length: 35 }, (_, i) => `B${i}`);
    const p = contexto();
    p.estatisticasMapa = Object.fromEntries(
      nomes.map((id, i) => [id, stats(id, 35 - i, 0.7 - i * 0.003)])
    );
    p.disponiveisIds = nomes.slice(25);
    p.perfisTaticos = {};
    const r = ranquearCandidatosApiPerfeito({
      ...p,
      poolNivel11Usuario: new Set(["B30"]),
    });
    expect(r).toHaveLength(1);
    expect(r[0].bloqueado).toBe("mapa");
    // Vitória extrema não dispensa presença entre os mais usados do mapa.
    p.disponiveisIds = nomes;
    p.estatisticasMapa.B26 = stats("B26", 9, 0.97);
    const extremo = ranquearCandidatosApiPerfeito(p).find(
      r => r.brawlerId === "B26"
    )!;
    expect(extremo.bloqueado).toBe("mapa");
  });
  it("exige dois counters fortes para liberar um nicho no fechamento", () => {
    const p = contexto();
    p.estatisticasMapa.Piper = stats("Piper", 0.001, 0.55);
    const r = (alvos: string[], turno = 6) =>
      ranquearCandidatosApiPerfeito({
        ...p,
        turno,
        inimigosIds: ["Brock", "Bull"],
        obterCounterDeReserva: (a, b) =>
          a === "Piper" && alvos.includes(b) ? 0.8 : undefined,
      }).find(r => r.brawlerId === "Piper")!;
    expect(r(["Brock"]).bloqueado).toBe("nicho");
    expect(r(["Brock", "Bull"]).bloqueado).toBeUndefined();
    expect(r(["Brock", "Bull"], 1).bloqueado).toBe("nicho");
  });
  it("nem sinergia extrema nem dois counters liberam um tanque incompatível com mapa aberto", () => {
    const { parametros } = mapaApiDoCatalogo("Bridge Too Far");
    const r = ranquearCandidatosApiPerfeito({
      ...parametros,
      turno: 6,
      aliadosIds: ["Gus", "Colette"],
      inimigosIds: ["Piper", "Angelo"],
      obterCounterDeReserva: a => (a === "Bull" ? 2 : undefined),
      obterSinergiaDeReserva: () => 4,
    }).find(r => r.brawlerId === "Bull")!;
    expect(r.bloqueado).toBeDefined();
    expect(r.fatores.riscoMinimaxLogit).toBeLessThanOrEqual(0);
  });
  it.each([1, 2, 3])(
    "um counter bom no mapa sobe de fora do Top 3 contra %i inimigos",
    n => {
      const nomes = [
        "Piper",
        "Angelo",
        "Belle",
        "Nani",
        "Mandy",
        "Gus",
        "Colt",
        "Byron",
        "Bull",
        "Frank",
        "Edgar",
      ];
      const p = {
        ...contexto(),
        disponiveisIds: nomes,
        estatisticasMapa: Object.fromEntries(
          nomes.map(id => [
            id,
            stats(
              id,
              0.1,
              ["Bull", "Frank", "Edgar"].includes(id)
                ? 0.4
                : id === "Byron"
                  ? 0.545
                  : 0.55
            ),
          ])
        ),
        perfisTaticos: perfisTaticosDoDraft(nomes),
      };
      const alvos = ["Bull", "Frank", "Edgar"].slice(0, n);
      const antes = ranquearCandidatosApiPerfeito({
        ...p,
        turno: n === 1 ? 2 : 6,
        inimigosIds: alvos,
      });
      expect(
        antes.filter(x => !x.bloqueado).findIndex(x => x.brawlerId === "Byron")
      ).toBeGreaterThan(2);
      const r = ranquearCandidatosApiPerfeito({
        ...p,
        turno: n === 1 ? 2 : 6,
        inimigosIds: alvos,
        obterConfronto: (a, b) =>
          a === "Byron" && alvos.includes(b)
            ? { jogosMapa: 30, vitoriasA: 24, jogosModo: 30, vitoriasAModo: 24 }
            : undefined,
      });
      expect(
        r
          .filter(x => !x.bloqueado)
          .slice(0, 3)
          .map(x => x.brawlerId)
      ).toContain("Byron");
      expect(
        r.find(x => x.brawlerId === "Byron")!.fatores.counterLiquidoLogit
      ).toBeGreaterThan(0);
    }
  );
  it("a grelha rotulada do terreno prevalece sobre o perfil de recurso do mapa", () => {
    const rows = [
      { map: "Hot Potato", brawler: "Bull", score: 90, winRate: 60, usage: 10 },
    ];
    const perfis = perfisTaticosDoDraft(["Bull"]);
    const aberto = criarReferenciasDoMapa(rows, perfis, "Hot Potato", {
      mapaId: "15000015",
      colunas: 21,
      linhas: 33,
      grelha: ".".repeat(693),
      grupos: [],
      rotulado: "ia",
    });
    expect(aberto.Bull.adequacaoTerreno).toBeLessThan(0.6);
    expect(
      criarReferenciasDoMapa(rows, perfis, "Hot Potato").Bull.adequacaoTerreno
    ).toBeGreaterThan(0.6);
  });
  it("a ficha e o Draft usam o mesmo prior específico do mapa", () => {
    const resumo = {
      partidas: 100,
      partidasPonderadas: 100,
      brawlers: [
        { brawler: "Piper", jogos: 10, vitorias: 7 },
        { brawler: "Bull", jogos: 10, vitorias: 3 },
      ],
      confrontos: [{ a: "Piper", b: "Bull", jogos: 10, vitorias: 7 }],
      sinergias: [],
      equipas: [],
    };
    const referenciasMapa = criarReferenciasDoMapa(
      [
        {
          map: "Bridge Too Far",
          brawler: "Piper",
          score: 90,
          winRate: 60,
          usage: 10,
        },
        {
          map: "Bridge Too Far",
          brawler: "Bull",
          score: 20,
          winRate: 40,
          usage: 0.1,
        },
      ],
      perfisTaticosDoDraft(["Piper", "Bull"]),
      "Bridge Too Far"
    );
    const modelo = montarDadosDoMotorApi(["Piper", "Bull"], {
      ...resumo,
      referenciasMapa,
    });
    const ficha = fichaDoBrawler(
      resumo,
      "Bull",
      {},
      undefined,
      "heist",
      referenciasMapa
    );
    expect(ficha.confrontos[0].deltaLogit).toBeDefined();
    const esperado = calcularDeltaCounterPuro(
      logit(calcularWinRateBayesiano(modelo.estatisticasMapa.Piper)),
      logit(calcularWinRateBayesiano(modelo.estatisticasMapa.Bull)),
      modelo.obterConfronto("Piper", "Bull"),
      fontesDeApoioDaApi("heist").obterCounterDeReserva?.("Piper", "Bull")
    );
    expect(ficha.confrontos[0].deltaLogit).toBeCloseTo(esperado);
    expect(
      fichaDoBrawler(resumo, "Bull", {}, undefined, "heist").confrontos[0]
        .deltaLogit
    ).not.toBeCloseTo(esperado);
    const base = calcularWinRateBayesiano(modelo.estatisticasMapa.Bull);
    expect(base).toBeLessThan(0.43);
  });
});
