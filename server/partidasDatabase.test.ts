import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ erro: null as unknown, respostas: [] as unknown[][] }));
vi.mock("mysql2/promise", () => ({ createPool: vi.fn(() => ({})) }));
vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => {
    const consulta = {
      from: () => consulta,
      innerJoin: () => consulta,
      where: () => consulta,
      orderBy: () => consulta,
      limit: () => consulta,
      groupBy: () => consulta,
      then: (sucesso: (valor: unknown) => unknown, falha: (erro: unknown) => unknown) =>
        (mocks.erro ? Promise.reject(mocks.erro) : Promise.resolve(mocks.respostas.shift() ?? [])).then(sucesso, falha),
    };
    return { select: () => consulta };
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost/test");
  mocks.erro = null;
  mocks.respostas = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("leituras reais da página Partidas", () => {
  it("não converte erro de SQL em partidas vazias, mapas vazios ou cobertura zero", async () => {
    const db = await import("./db");
    mocks.erro = new Error("query com parâmetros privados", { cause: { code: "ETIMEDOUT" } });
    await expect(db.listObservedBattlesParaResumo({})).rejects.toThrow("Não foi possível comunicar");
    await expect(db.listObservedMapsParaResumo()).rejects.toThrow("Não foi possível comunicar");
    await expect(db.getObservedMatchCollectionCoverage()).rejects.toThrow("Não foi possível comunicar");
  });

  it("não anuncia zero partidas quando falta DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const db = await import("./db");
    await expect(db.listObservedBattlesParaResumo({})).rejects.toThrow("não configurada");
    await expect(db.listObservedMapsParaResumo()).rejects.toThrow("não configurada");
    await expect(db.getObservedMatchCollectionCoverage()).rejects.toThrow("não configurada");
  });

  it("mantém os totais guardados e distingue uma consulta realmente vazia", async () => {
    const db = await import("./db");
    mocks.respostas = [[{ value: 752266 }], [{ value: "13540788" }]];
    await expect(db.getObservedMatchCollectionCoverage()).resolves.toEqual({ battles: 752266, pairSamples: 13540788 });
    await expect(db.listObservedBattlesParaResumo({})).resolves.toEqual([]);
    await expect(db.listObservedMapsParaResumo()).resolves.toEqual([]);
  });
});
