import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const client = vi.hoisted(() => ({ query: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => [[], []]) }));
vi.mock("mysql2/promise", () => ({ createPool: () => client }));
beforeEach(() => {
  vi.resetModules(); client.query.mockReset().mockResolvedValue([[], []]);
  vi.stubEnv("DATABASE_URL", "mysql://test:test@example.tidbcloud.com/defaultdb");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function consulta(indice = client.query.mock.calls.length - 1) {
  const [opcoes, params] = client.query.mock.calls[indice] as [{ sql: string }, unknown[]];
  return { sql: opcoes.sql, params };
}
describe("consultas reais do ORM para ranks na TiDB", () => {
  it("ordena IDs sem carregar equipas no join e parametriza todos os filtros", async () => {
    const db = await import("./db");
    await db.listObservedBattlesParaResumo({ desde: new Date("2026-10-01Z"), rank: { min: 16, max: 18 }, mapId: "mapa' OR 1=1 --", mode: "knockout", limite: 60000 });
    const q = consulta();
    expect(q.sql).toMatch(/^select \/\*\+ SET_VAR\(tidb_executor_concurrency=1\) \*\//i);
    expect(q.sql).toContain("inner join");
    expect(q.sql).toContain("order by");
    expect(q.sql).not.toMatch(/winning_team|losing_team|OR 1=1/);
    expect(q.params).toEqual(expect.arrayContaining([16, 18, "mapa' OR 1=1 --", "knockout", 60000]));
  });
  it("lê equipas em lotes de no máximo mil e conserva exatamente a ordem selecionada", async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => 1001 - i);
    const partida = (id: number) => [id, "map-" + id, "knockout", '["A"]', '["B"]'];
    client.query.mockResolvedValueOnce([ids.map(id => [id]), []])
      .mockResolvedValueOnce([ids.slice(0, 1000).reverse().map(partida), []])
      .mockResolvedValueOnce([[partida(1)], []]);
    const db = await import("./db");
    const rows = await db.listObservedBattlesParaResumo({ rank: { min: 16, max: 18 } });
    expect(rows).toHaveLength(1001);
    expect(rows.map(r => r.mapId)).toEqual(ids.map(id => "map-" + id));
    expect(client.query).toHaveBeenCalledTimes(3);
    for (let i = 1; i <= 2; i++) {
      const q = consulta(i);
      expect(q.sql).not.toMatch(/join|order by/i);
      expect(q.sql).toContain("winning_team");
      expect(q.params.length).toBeLessThanOrEqual(1000);
    }
  });
  it("rejeita uma leitura parcial em vez de apresentar uma amostra menor como completa", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    client.query.mockResolvedValueOnce([[[1]], []]).mockResolvedValueOnce([[], []]);
    const db = await import("./db");
    await expect(db.listObservedBattlesParaResumo({ rank: { min: 16, max: 18 } })).rejects.toThrow("Não foi possível");
  });
  it("conta todos os mapas por rank sem limite nem textos das equipas", async () => {
    const db = await import("./db");
    await db.listObservedMapsParaResumo(undefined, { min: 16, max: 18 });
    const q = consulta();
    expect(q.sql).toMatch(/^select \/\*\+ SET_VAR/i);
    expect(q.sql).toContain("count(*)");
    expect(q.sql).toContain("group by");
    expect(q.sql).not.toMatch(/limit|winning_team|losing_team/);
    expect(q.params).toEqual([16, 18]);
  });
  it("mantém consultas sem rank sem join nem hint", async () => {
    const db = await import("./db"); await db.listObservedBattlesParaResumo({});
    expect(consulta().sql).not.toMatch(/SET_VAR|inner join/);
  });
  it("mantém os outros fornecedores sem hint específico da TiDB", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@mysql.example/defaultdb");
    const db = await import("./db"); await db.listObservedMapsParaResumo(undefined, { min: 10, max: 12 });
    expect(consulta().sql).not.toContain("SET_VAR");
    expect(consulta().params).toEqual([10, 12]);
  });
});
