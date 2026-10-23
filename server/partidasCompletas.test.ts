import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarResumoDasPartidas, resumirPartidas } from "@shared/partidasObservadas";
const client = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), release: vi.fn() }));
vi.mock("mysql2/promise", () => ({ createPool: () => ({ ...client, getConnection: async () => client }) }));
beforeEach(() => { vi.resetModules(); client.query.mockReset().mockResolvedValue([[], []]); client.execute.mockReset(); vi.stubEnv("DATABASE_URL", "mysql://test:test@example.tidbcloud.com/defaultdb"); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const desde = new Date("2026-09-22T21:00:00Z");
function consulta(i: number) { const [opts, params] = client.query.mock.calls[i]; return { sql: typeof opts === "string" ? opts : opts.sql, params }; }

describe("histórico completo sem corte aos 60 mil", () => {
  it("conta 60.001 partidas em sete lotes, com cursor e filtros preservados", async () => {
    client.query.mockResolvedValueOnce([[[60001]], []]);
    for (let start = 1; start <= 60001; start += 10000) {
      const ids = Array.from({ length: Math.min(10000, 60002 - start) }, (_, i) => start + i);
      client.query.mockResolvedValueOnce([ids.map(id => [id]), []]);
      client.query.mockResolvedValueOnce([ids.map(() => ["m", "knockout", '["A"]', '["B"]']), []]);
    }
    const { percorrerPartidasParaResumo } = await import("./db");
    const resumo = criarResumoDasPartidas();
    const lotes: number[] = [];
    await percorrerPartidasParaResumo({ desde, rank: { min: 16, max: 18 }, mode: "knockout", mapId: "m" }, linhas => {
      lotes.push(linhas.length);
      resumo.acrescentar(linhas.map(l => ({ mapId: l.mapId, mode: l.mode, vencedores: JSON.parse(l.winningTeam), derrotados: JSON.parse(l.losingTeam) })));
    });
    expect(resumo.terminar().partidas).toBe(60001);
    expect(lotes).toEqual([10000, 10000, 10000, 10000, 10000, 10000, 1]);
    expect(resumo.terminar().brawlers.find(b => b.brawler === "A")).toMatchObject({ jogos: 60001, vitorias: 60001 });
    for (let i = 1; i < 15; i += 2) {
      const ids = consulta(i); expect(ids.sql).not.toContain("join"); expect(ids.sql).toContain("order by");
      expect(ids.params).toEqual([Math.floor(i / 2) * 10000, 60001, "2026-09-22 21:00:00.000", "knockout", "m", 10000]);
      const linhas = consulta(i + 1); expect(linhas.sql).toContain("INL_JOIN(observed_battle_ranks)");
      expect(linhas.params.slice(-2)).toEqual([16, 18]);
    }
  });
  it("continua depois de um lote sem partidas desse rank", async () => {
    client.query.mockResolvedValueOnce([[[10001]], []])
      .mockResolvedValueOnce([Array.from({ length: 10000 }, (_, i) => [i + 1]), []])
      .mockResolvedValueOnce([[], []]).mockResolvedValueOnce([[[10001]], []])
      .mockResolvedValueOnce([[["m", "knockout", '["A"]', '["B"]']], []]);
    const { percorrerPartidasParaResumo } = await import("./db"); let total = 0;
    await percorrerPartidasParaResumo({ desde, rank: { min: 19, max: 21 } }, l => { total += l.length; });
    expect(total).toBe(1);
  });
  it("agregar em lotes conserva todas as estatísticas", () => {
    const partidas = [{ mapId: "1", mode: "heist", vencedores: ["B", "A", "A"], derrotados: ["C", "D"] },
      { mapId: "2", mode: "bounty", vencedores: ["D"], derrotados: ["A", "C"] }];
    const r = criarResumoDasPartidas(); for (const p of partidas) r.acrescentar([p]);
    expect(r.terminar()).toEqual(resumirPartidas(partidas));
  });
});

it("enriquece poder 11 de uma partida existente sem duplicar a partida ou os counters", async () => {
  client.query.mockResolvedValueOnce([[["fp"]], []]).mockResolvedValueOnce([{ affectedRows: 1 }, []]);
  const { recordObservedBattlesBatch } = await import("./db");
  const r = await recordObservedBattlesBatch([{ battle: { fingerprint: "fp", battleTime: desde, mapId: "m", mode: "heist", eventType: "soloRanked", winningTeam: '["A"]', losingTeam: '["B"]', sourcePlayerTag: "#P" }, deltas: [], todosNivel11: true }]);
  expect(r).toEqual({ battlesInserted: 0, pairObservations: 0 });
  const sqls = client.query.mock.calls.map((_, i) => consulta(i));
  expect(sqls).toHaveLength(2);
  expect(sqls[1].sql).toContain("insert into `observed_battle_quality`");
  expect(sqls[1].sql).toContain("on duplicate key update");
  expect(sqls[1].params).toEqual(["fp", 1]);
});

describe("retenção de 30 dias", () => {
  const agora = new Date("2026-10-22T21:00:00Z");
  const antiga = [7, "fp", new Date("2026-09-01Z"), "m", "knockout", "soloRanked", '["A"]', '["B"]', "#P", new Date("2026-09-01Z")];
  it("sem antigas só consulta, usa limite estrito e não apaga dados", async () => {
    const { expirarPartidasAntigas } = await import("./db");
    expect(await expirarPartidasAntigas(agora)).toEqual({ removidas: 0, corte: desde.toISOString() });
    const sqls = client.query.mock.calls.map((_, i) => consulta(i).sql);
    expect(sqls).toContain("begin"); expect(sqls).toContain("commit");
    const q = consulta(1); expect(q.sql).toContain("< ?"); expect(q.sql).toContain("for update");
    expect(q.params).toEqual(["2026-09-22 21:00:00.000", 1000]); expect(sqls.join()).not.toContain("delete");
  });
  it("desconta os dois sentidos, apaga ranks e partidas na mesma transação", async () => {
    client.query.mockImplementation(async (opts: { sql?: string } | string) => {
      const text = typeof opts === "string" ? opts : opts.sql!;
      if (text.startsWith("select")) return [[antiga], []];
      if (text.startsWith("update")) return [{ affectedRows: 2 }, []];
      return [{ affectedRows: 1 }, []];
    });
    const { expirarPartidasAntigas } = await import("./db");
    expect((await expirarPartidasAntigas(agora)).removidas).toBe(1);
    const sqls = client.query.mock.calls.map((_, i) => consulta(i).sql);
    expect(sqls.findIndex(s => s.startsWith("update"))).toBeLessThan(sqls.findIndex(s => s.startsWith("delete")));
    expect(sqls.filter(s => s.startsWith("delete"))).toHaveLength(3);
    expect(sqls[sqls.length - 1]).toBe("commit");
    expect(consulta(2).params).toEqual(expect.arrayContaining(["A", "B", "m", "knockout"]));
  });
  it("faz rollback sem apagar quando falta um agregado", async () => {
    client.query.mockImplementation(async (opts: { sql?: string } | string) => {
      const text = typeof opts === "string" ? opts : opts.sql!;
      if (text.startsWith("select")) return [[antiga], []];
      return [{ affectedRows: 0 }, []];
    });
    const { expirarPartidasAntigas } = await import("./db");
    await expect(expirarPartidasAntigas(agora)).rejects.toThrow("limpeza cancelada");
    const sqls = client.query.mock.calls.map((_, i) => consulta(i).sql);
    expect(sqls.at(-1)).toBe("rollback"); expect(sqls.join()).not.toContain("delete");
  });
});
