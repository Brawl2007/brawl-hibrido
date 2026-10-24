import { describe, expect, it } from "vitest";
import { criarReferenciasDoMapa } from "../shared/adequacaoAoMapa";
import { perfisTaticosDoDraft, rankDraftEntries } from "../shared/draft";
import {
  calcularDeltaMecanico,
  combinarReservaMecanica,
  type ContextoMecanicoDoMapa,
} from "../shared/estrategiaTatica";
import {
  ranquearCandidatosApiPerfeito,
  calcularPenalidadeTaticaDinamica,
  type ParametrosMotorApi,
} from "../shared/motorApiPerfeito";
import { mapaApiDoCatalogo } from "./fixtures/mapaApi";

const nomes = [
  "Gus",
  "Gene",
  "Sandy",
  "Mr. P",
  "Poco",
  "Rico",
  "Frank",
  "Bull",
  "Buster",
  "Gale",
  "Otis",
  "Colette",
  "Barley",
  "Sprout",
  "Tick",
  "Belle",
  "Piper",
  "Amber",
  "Emz",
  "Mico",
  "Mortis",
  "Colt",
  "Brock",
  "R-t",
  "Chester",
  "Pearl",
];
const perfis = perfisTaticosDoDraft(nomes);
const paredes = { abertura: 0.25, modo: "knockout" };
const aberto = { abertura: 0.98, modo: "knockout" };
const delta = (
  a: string,
  b: string,
  contexto: ContextoMecanicoDoMapa = paredes
) => calcularDeltaMecanico(perfis[a], perfis[b], contexto);

/** Estatísticas controladas do mesmo mapa; nenhum confronto observado. */
function contexto(mapa = "Belle's Rock"): ParametrosMotorApi {
  const rows = nomes.map(brawler => ({
    brawler,
    map: mapa,
    score: 70,
    tier: "A" as const,
    topBrawlWinRate: ["Frank", "Barley"].includes(brawler) ? 57 : 56,
    topBrawlUseRate: 3,
  }));
  const refs = criarReferenciasDoMapa(rows, perfis, mapa);
  return {
    disponiveisIds: nomes,
    aliadosIds: [],
    inimigosIds: [],
    modoDeJogo: "knockout",
    turno: 1,
    estatisticasMapa: Object.fromEntries(
      rows.map(r => [
        r.brawler,
        {
          brawlerId: r.brawler,
          jogosMapa: 100,
          vitoriasMapa: r.topBrawlWinRate,
          jogosModo: 100,
          vitoriasModo: 50,
          taxaUsoMapa: 3,
          referenciaMapa: refs[r.brawler],
        },
      ])
    ),
    perfisTaticos: perfis,
    obterConfronto: () => undefined,
    obterSinergia: () => undefined,
  };
}
const ranking = (p: ParametrosMotorApi) => ranquearCandidatosApiPerfeito(p);
const achar = (p: ParametrosMotorApi, id: string) =>
  ranking(p).find(r => r.brawlerId === id)!;
const fechamento = (p = contexto()) => ({
  ...p,
  turno: 5,
  aliadosIds: ["Gus", "Sprout"],
  inimigosIds: ["Belle", "Amber"],
});

describe("v181: hipóteses mecânicas contextuais", () => {
  it.each([
    ["Mico", "Sprout"],
    ["Colette", "Frank"],
    ["Gale", "Mortis"],
    ["Bull", "Mortis"],
    ["Frank", "Gene"],
    ["Barley", "Belle"],
    ["Brock", "Barley"],
  ])("reconhece %s contra %s e inverte o sinal do duelo", (a, b) => {
    expect(delta(a, b)).toBeGreaterThan(0.3);
    expect(delta(b, a)).toBeCloseTo(-delta(a, b));
  });
  it("usa geometria real e alcance; não inventa paredes para o lançador", () => {
    expect(delta("Barley", "Belle", aberto)).toBeLessThan(0);
    expect(delta("Frank", "Gene", aberto)).toBe(0);
    expect(delta("Barley", "Belle", { abertura: null, modo: "knockout" })).toBe(
      0
    );
    expect(
      delta("Barley", "Belle", { ...paredes, paredesDestruidas: true })
    ).toBe(0);
    expect(delta("Piper", "Gene", aberto)).toBeGreaterThan(0);
    expect(delta("R-t", "Belle", aberto)).toBeGreaterThan(0);
  });
  it("apoia o par escasso e desaparece gradualmente quando o mapa reúne 15 jogos", () => {
    expect(combinarReservaMecanica(undefined, 0.9, 0)).toBe(0.9);
    expect(combinarReservaMecanica(undefined, 0.9, 3)).toBeGreaterThan(0);
    expect(combinarReservaMecanica(0.2, 0.9, 3)).toBeGreaterThan(0.2);
    expect(combinarReservaMecanica(0.2, 0.9, 15)).toBe(0.2);
    expect(combinarReservaMecanica(0.2, 0.9, 1000)).toBe(0.2);
  });
  it("reage ao inimigo sem jogos do par, sem transformar essa hipótese em jogos observados", () => {
    const p = { ...contexto(), turno: 2, inimigosIds: ["Frank"] };
    const r = achar(p, "Colette");
    expect(r.fatores.counterLiquidoLogit).toBeGreaterThan(0);
    expect(p.obterConfronto("Colette", "Frank")).toBeUndefined();
    expect(
      achar({ ...p, counterDeReservaExcluido: () => true }, "Colette").fatores
        .counterLiquidoLogit
    ).toBe(0);
  });
  it("respeita evidência robusta do mapa em vez de forçar o arquétipo", () => {
    const p = {
      ...contexto(),
      turno: 6,
      inimigosIds: ["Mico"],
      obterConfronto: () => ({
        jogosMapa: 300,
        vitoriasA: 150,
        jogosModo: 300,
        vitoriasAModo: 150,
      }),
    };
    const r = achar(p, "Sprout");
    expect(r.fatores.counterLiquidoLogit).toBe(0);
    expect(r.alertaHardCounter).toBeUndefined();
  });
});

function simularDraft(mapa: string, escolhas: string[]) {
  const base = contexto(mapa),
    a: string[] = [],
    b: string[] = [];
  return escolhas.map((escolha, i) => {
    const primeiro = [0, 3, 4].includes(i);
    const p = {
      ...base,
      turno: i + 1,
      ordemTime: primeiro ? ("first_pick" as const) : ("second_pick" as const),
      aliadosIds: [...(primeiro ? a : b)],
      inimigosIds: [...(primeiro ? b : a)],
    };
    const rs = ranking(p);
    expect(rs.some(r => [...a, ...b].includes(r.brawlerId))).toBe(false);
    for (const r of rs) {
      expect(Object.values(r.fatores).reduce((s, v) => s + v, 0)).toBeCloseTo(
        r.logOddsFinal
      );
      expect(r.pesosDoPick!.vitoria).toBeCloseTo(
        [0.7, 0.75, 0.8, 0.85, 0.9, 0.95][i]
      );
    }
    (primeiro ? a : b).push(escolha);
    return { p, rs };
  });
}

describe("v181: partidas completas na ordem 1-2-2-1", () => {
  it("um tanque bom no mapa sobe contra três inimigos sem DPS anti-tanque", () => {
    const fases = simularDraft("Center Stage", [
      "Gus",
      "Poco",
      "Colette",
      "Gene",
      "Sandy",
      "Frank",
    ]);
    const ultimo = fases[5].rs.filter(r => !r.bloqueado);
    const frank = ultimo.find(r => r.brawlerId === "Frank")!;
    expect(ultimo.slice(0, 3).map(r => r.brawlerId)).toContain("Frank");
    expect(frank.fatores.counterLiquidoLogit).toBeGreaterThan(0.2);
    expect(frank.motivosTaticos).toContain(
      "Último pick contra uma equipa sem anti-tanque"
    );
    expect(frank.fatores.counterLiquidoLogit).toBeGreaterThan(
      achar({ ...fases[5].p, inimigosIds: [] }, "Frank").fatores
        .counterLiquidoLogit
    );
    const protegido = achar(
      { ...fases[5].p, inimigosIds: ["Gus", "Gene", "Colette"] },
      "Frank"
    );
    expect(protegido.bloqueado).toBe("hard-counter");
    expect(protegido.motivosTaticos ?? []).not.toContain(
      "Último pick contra uma equipa sem anti-tanque"
    );
  });
  it("um lançador bom no mapa sobe quando os três inimigos não têm invasor nem quebra de parede", () => {
    const fases = simularDraft("Belle's Rock", [
      "Belle",
      "Gus",
      "Rico",
      "Amber",
      "Emz",
      "Barley",
    ]);
    const ultimo = fases[5].rs.filter(r => !r.bloqueado);
    expect(ultimo.slice(0, 3).map(r => r.brawlerId)).toContain("Barley");
    expect(
      ultimo.find(r => r.brawlerId === "Barley")!.fatores.counterLiquidoLogit
    ).toBeGreaterThan(0.2);
    const comMico = achar(
      { ...fases[5].p, inimigosIds: ["Belle", "Amber", "Mico"] },
      "Barley"
    );
    expect(comMico.bloqueado).toBe("hard-counter");
    const comBrock = achar(
      { ...fases[5].p, inimigosIds: ["Belle", "Amber", "Brock"] },
      "Barley"
    );
    expect(comBrock.motivosTaticos ?? []).toHaveLength(0);
  });
  it("o quinto pick prioriza guarda-costas após lançador no quarto; o assassino do sexto enfrenta a proteção", () => {
    const fases = simularDraft("Belle's Rock", [
      "Gus",
      "Belle",
      "Amber",
      "Sprout",
      "Gale",
      "Mico",
    ]);
    const quinto = fases[4].rs.filter(r => !r.bloqueado);
    expect(quinto[0].aliadosProtegidos).toContain("Sprout");
    expect(perfis[quinto[0].brawlerId].isBodyguard).toBe(true);
    const gale = quinto.find(r => r.brawlerId === "Gale")!;
    expect(gale.fatores.guardaCostasLogit).toBeGreaterThan(0);
    expect(gale.ameacasCobertas).toContain("Mico");
    const mico = fases[5].rs.find(r => r.brawlerId === "Mico")!;
    expect(mico.alertaHardCounter).toContain("Gale");
    expect(
      calcularPenalidadeTaticaDinamica({
        candidatoId: "Brock",
        aliadosIds: ["Gus", "Sprout"],
        inimigosIds: ["Belle", "Amber"],
        modoDeJogo: "knockout",
        perfis,
      })
    ).toBeGreaterThan(
      calcularPenalidadeTaticaDinamica({
        candidatoId: "Gale",
        aliadosIds: ["Gus", "Sprout"],
        inimigosIds: ["Belle", "Amber"],
        modoDeJogo: "knockout",
        perfis,
      })
    );
  });
});

describe("v181: proteção contextual e preservação do mapa", () => {
  it("zera a proteção sem aliado frágil, sem ameaças abertas, com protetor existente ou com inimigos completos", () => {
    const p = fechamento();
    expect(achar(p, "Gale").fatores.guardaCostasLogit).toBeGreaterThan(0);
    for (const extra of [
      { aliadosIds: ["Gus", "Rico"] },
      { aliadosIds: ["Sprout", "Otis"] },
      { banidosIds: ["Mico", "Mortis", "Frank", "Bull", "Buster"] },
      { inimigosIds: ["Belle", "Amber", "Gene"] },
      { turno: 6 },
    ])
      expect(achar({ ...p, ...extra }, "Gale").fatores.guardaCostasLogit).toBe(
        0
      );
    const pool = achar(
      { ...p, poolNivel11Usuario: new Set(["Gale", "Rico"]) },
      "Gale"
    );
    expect(pool.fatores.guardaCostasLogit).toBe(
      achar(p, "Gale").fatores.guardaCostasLogit
    );
  });
  it("o wallbreaker reage à composição inimiga e não recebe esse bônus contra as paredes do aliado", () => {
    const p = {
      ...contexto(),
      turno: 4,
      aliadosIds: ["Gus"],
      inimigosIds: ["Sprout", "Gene"],
    };
    expect(achar(p, "Brock").fatores.respostaTaticaLogit).toBeGreaterThan(0);
    expect(
      achar({ ...p, aliadosIds: ["Gus", "Barley"] }, "Brock").fatores
        .respostaTaticaLogit
    ).toBe(0);
  });
  it.each(["Bridge Too Far", "Shooting Star", "Out in the Open"])(
    "não libera tanques ou lançadores em %s, inclusive com counters mecânicos",
    mapa => {
      const { parametros } = mapaApiDoCatalogo(mapa);
      for (const turno of [1, 2, 3, 6]) {
        const rs = ranking({
          ...parametros,
          turno,
          aliadosIds: [],
          inimigosIds: turno === 1 ? [] : ["Gene", "Mr. P", "Sandy"],
        });
        for (const r of rs.filter(r => !r.bloqueado)) {
          expect(["tank", "thrower"]).not.toContain(
            parametros.perfisTaticos[r.brawlerId]?.classe
          );
        }
      }
    }
  );
  it("a ligação real do Draft preserva os dados do mapa e mostra a proteção", () => {
    const p = fechamento();
    const rows = nomes.map(brawler => ({
      brawler,
      score: 70,
      tier: "A" as const,
    }));
    const rs = rankDraftEntries(
      rows,
      new Set([...p.aliadosIds, ...p.inimigosIds]),
      "",
      "Todos",
      {
        dadosApi: { ...p, obterTrio: () => undefined },
        pickNumber: 5,
        mapModeId: "knockout",
        allyRows: rows.filter(r => p.aliadosIds.includes(r.brawler)),
        enemyRows: rows.filter(r => p.inimigosIds.includes(r.brawler)),
      }
    );
    const gale = rs.find(r => r.row.brawler === "Gale")!.api!;
    expect(gale.aliadosProtegidos).toContain("Sprout");
    expect(gale.fatores.guardaCostasLogit).toBeGreaterThan(0);
  });
});
