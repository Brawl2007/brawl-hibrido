import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const client = vi.hoisted(() => ({ query: vi.fn(async () => [[], []]) }));
vi.mock("mysql2/promise", () => ({ createPool: () => client }));
beforeEach(() => { vi.resetModules(); client.query.mockClear(); vi.stubEnv("DATABASE_URL","mysql://test:test@example.tidbcloud.com/defaultdb"); });
afterEach(() => vi.unstubAllEnvs());
function consulta() { const chamada = client.query.mock.calls.at(-1) as unknown as [{sql:string},unknown[]]; return {sql:chamada[0].sql,params:chamada[1]}; }
describe("consultas reais do ORM para ranks na TiDB", () => {
 it("usa o índice por fingerprint sem interpolar os filtros no SQL", async () => {
  const db=await import("./db");
  await db.listObservedBattlesParaResumo({rank:{min:16,max:18},mapId:"mapa' OR 1=1 --",mode:"knockout",limite:60000});
  const q=consulta();
  expect(q.sql).toMatch(/^select \/\*\+ INL_HASH_JOIN\(observed_battle_ranks\) \*\//i);
  expect(q.sql).toContain("inner join");
  expect(q.sql).toContain("order by");
  expect(q.sql).not.toContain("OR 1=1");
  expect(q.params).toEqual(expect.arrayContaining([16,18,"mapa' OR 1=1 --","knockout",60000]));
 });
 it("aplica o mesmo plano à contagem completa de mapas por rank", async () => {
  const db=await import("./db");
  await db.listObservedMapsParaResumo(undefined,{min:16,max:18});
  const q=consulta();
  expect(q.sql).toMatch(/^select \/\*\+ INL_HASH_JOIN/i);
  expect(q.sql).toContain("count(*)");
  expect(q.sql).toContain("group by");
  expect(q.sql).not.toContain("limit");
  expect(q.params).toEqual([16,18]);
 });
 it("mantém consultas sem rank sem join nem hint", async () => {
  const db=await import("./db");await db.listObservedBattlesParaResumo({});
  expect(consulta().sql).not.toMatch(/INL_HASH_JOIN|inner join/);
 });
 it("mantém os outros fornecedores sem hint específico da TiDB", async () => {
  vi.stubEnv("DATABASE_URL","mysql://test:test@mysql.example/defaultdb");
  const db=await import("./db");await db.listObservedMapsParaResumo(undefined,{min:10,max:12});
  expect(consulta().sql).not.toContain("INL_HASH_JOIN");
  expect(consulta().params).toEqual([10,12]);
 });
});
