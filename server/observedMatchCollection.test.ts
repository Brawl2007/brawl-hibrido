import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JOGADORES_POR_RECOLHA, PAISES_DA_RECOLHA, createMatchupDeltas, jogadoresDaVolta, normalizeObservedBattle, normalizeObservedMode, paisesDaVolta, podeRecolherAgora, resolveObservedMapId } from "./observedMatchCollection";
import { AGENDAMENTO_DAS_PARTIDAS, INTERVALO_DAS_PARTIDAS_MS } from "@shared/agendamentoPartidas";

const rankedBattle = {
  battleTime: "20260816T184500.000Z",
  event: { id: 15000025, mode: "brawlBall", map: "Triple Dribble" },
  battle: {
    type: "soloRanked",
    result: "victory",
    teams: [
      [
        { tag: "#ENEMY1", brawler: { name: "Bibi" } },
        { tag: "#ENEMY2", brawler: { name: "Max" } },
      ],
      [
        { tag: "#SOURCE", brawler: { name: "Bea" } },
        { tag: "#ALLY", brawler: { name: "Piper" } },
      ],
    ],
  },
} as const;

describe("observed Ranked battle collection", () => {
  it("records only the winning source team and creates symmetric pair observations", () => {
    const battle = normalizeObservedBattle(rankedBattle, "#SOURCE");

    expect(battle).not.toBeNull();
    expect(battle).toMatchObject({
      mapId: "15000025",
      mode: "brawlball",
      winningTeam: ["Bea", "Piper"],
      losingTeam: ["Bibi", "Max"],
      sourcePlayerTag: "#SOURCE",
    });
    expect(battle?.deltas).toContainEqual({
      mapId: "15000025",
      mode: "brawlball",
      brawler: "Bea",
      opponent: "Bibi",
      wins: 1,
      losses: 0,
    });
    expect(battle?.deltas).toContainEqual({
      mapId: "15000025",
      mode: "brawlball",
      brawler: "Bibi",
      opponent: "Bea",
      wins: 0,
      losses: 1,
    });
    expect(battle?.deltas).toHaveLength(8);
  });

  it("inverts the teams when the observed source loses", () => {
    const battle = normalizeObservedBattle(
      { ...rankedBattle, battle: { ...rankedBattle.battle, result: "defeat" } },
      "#SOURCE"
    );

    expect(battle?.winningTeam).toEqual(["Bibi", "Max"]);
    expect(battle?.losingTeam).toEqual(["Bea", "Piper"]);
    expect(battle?.deltas).toContainEqual(expect.objectContaining({ brawler: "Bea", opponent: "Bibi", losses: 1 }));
  });

  it("rejects non-Ranked, tied or source-less entries instead of inventing a winner", () => {
    // Na API, "ranked" são os jogos de troféus — não o modo Ranked.
    expect(normalizeObservedBattle({ ...rankedBattle, battle: { ...rankedBattle.battle, type: "ranked" } }, "#SOURCE")).toBeNull();
    expect(normalizeObservedBattle({ ...rankedBattle, battle: { ...rankedBattle.battle, type: "friendly" } }, "#SOURCE")).toBeNull();
    expect(normalizeObservedBattle({ ...rankedBattle, battle: { ...rankedBattle.battle, result: "draw" } }, "#SOURCE")).toBeNull();
    expect(normalizeObservedBattle(rankedBattle, "#MISSING")).toBeNull();
  });

  it("uses every winner-versus-loser pair in both directions", () => {
    const deltas = createMatchupDeltas("map", "mode", ["Bea", "Piper"], ["Bibi"]);
    expect(deltas).toHaveLength(4);
    expect(deltas).toContainEqual(expect.objectContaining({ brawler: "Piper", opponent: "Bibi", wins: 1 }));
    expect(deltas).toContainEqual(expect.objectContaining({ brawler: "Bibi", opponent: "Piper", losses: 1 }));
  });

  it("normalizes the official mode and restricts the collection to known Ranked maps", () => {
    expect(normalizeObservedMode("brawlBall")).toBe("brawlball");
    expect(resolveObservedMapId("Triple Dribble")).toBe("15000025");
    expect(resolveObservedMapId("Mapa fora da rotação")).toBeNull();
  });
});

describe("recolha de partidas Ranked a sério (v155)", () => {
  it("aceita o Ranked a solo e em equipa", () => {
    expect(normalizeObservedBattle(rankedBattle, "#SOURCE")).not.toBeNull();
    expect(normalizeObservedBattle({ ...rankedBattle, battle: { ...rankedBattle.battle, type: "teamRanked" } }, "#SOURCE")).not.toBeNull();
  });

  it("roda países e jogadores de volta para volta, sem repetir", () => {
    expect(paisesDaVolta(0)).toEqual(PAISES_DA_RECOLHA.slice(0, 3));
    expect(paisesDaVolta(1)).toEqual(PAISES_DA_RECOLHA.slice(3, 6));
    const tags = Array.from({ length: 500 }, (_, i) => `#P${i}`);
    const a = jogadoresDaVolta(tags, 0);
    const b = jogadoresDaVolta(tags, 1);
    expect(a).toHaveLength(JOGADORES_POR_RECOLHA);
    expect(new Set(a).size).toBe(JOGADORES_POR_RECOLHA);
    expect(a.filter((tag) => b.includes(tag))).toEqual([]);
    expect(jogadoresDaVolta(["#a", "#A", "#b"], 3)).toEqual(["#A", "#B"]);
  });

  it("recusa outra recolha na mesma janela de 15 minutos", () => {
    const agora = new Date("2026-09-29T12:10:00Z");
    const ha = (min: number) => new Date(agora.getTime() - min * 60_000);
    expect(INTERVALO_DAS_PARTIDAS_MS).toBe(15 * 60_000);
    expect(podeRecolherAgora(undefined, agora).pode).toBe(true);
    expect(podeRecolherAgora({ lastStatus: "success", lastStartedAt: ha(5) }, agora).pode).toBe(false);
    expect(podeRecolherAgora({ lastStatus: "success", lastStartedAt: ha(15) }, agora).pode).toBe(true);
    expect(podeRecolherAgora({ lastStatus: "running", lastStartedAt: ha(5) }, agora)).toMatchObject({ pode: false, motivo: "Já há uma recolha a correr." });
    // Uma recolha que morreu a meio não bloqueia para sempre.
    expect(podeRecolherAgora({ lastStatus: "running", lastStartedAt: ha(60) }, agora).pode).toBe(true);
  });

  it("grava tudo em lote e alguém chama a recolha na Vercel", () => {
    const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf8");
    expect(ler("server/observedMatchCollection.ts")).toContain("recordObservedBattlesBatch(");
    expect(ler("server/_core/index.vercel.ts")).toContain('app.get("/api/partidas/recolher"');
    expect(JSON.parse(ler("vercel.json")).crons.map((cron: { path: string }) => cron.path)).toContain("/api/partidas/recolher");
    const workflow = ler(".github/workflows/recolher-partidas.yml");
    expect(workflow).toContain(`cron: "${AGENDAMENTO_DAS_PARTIDAS.cron}"`);
    expect(workflow).toContain("https://brawl-hibrido.vercel.app/api/partidas/recolher");
  });
});

describe("soma dos pares em lote", () => {
  it("junta o mesmo par de partidas diferentes numa só linha, sem mexer nas originais", async () => {
    const { somarParesDoLote } = await import("./db");
    const a = createMatchupDeltas("m", "hotzone", ["Lumi"], ["Surge"]);
    const b = createMatchupDeltas("m", "hotzone", ["Surge"], ["Lumi"]);
    const pares = somarParesDoLote([{ deltas: a }, { deltas: b }, { deltas: a }]);
    expect(pares).toHaveLength(2);
    expect(pares).toContainEqual(expect.objectContaining({ brawler: "Lumi", opponent: "Surge", wins: 2, losses: 1 }));
    expect(pares).toContainEqual(expect.objectContaining({ brawler: "Surge", opponent: "Lumi", wins: 1, losses: 2 }));
    expect(a[0].wins).toBe(1);
  });
});

describe("recolha sem chave", () => {
  it("diz que falta a chave em vez de dizer que a API não tem jogadores", async () => {
    delete process.env.BRAWL_STARS_API_KEY;
    const { collectObservedRankedMatches } = await import("./observedMatchCollection");
    const resultado = await collectObservedRankedMatches("manual");
    expect(resultado).toMatchObject({ ok: false });
    expect((resultado as { error: string }).error).toMatch(/Sem chave da API oficial/);
  });
});
