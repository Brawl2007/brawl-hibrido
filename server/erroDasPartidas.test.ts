import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnosticoDasPartidas, lerPartidasSemOcultarErro, metadadosDoErroDasPartidas } from "./erroDasPartidas";

afterEach(() => vi.restoreAllMocks());

describe("diagnóstico das partidas sem expor consultas ou segredos", () => {
  it.each([
    ["ER_OPTION_PREVENTS_STATEMENT", "DATABASE_WRITE_BLOCKED"],
    ["ER_RECORD_FILE_FULL", "DATABASE_STORAGE_FULL"],
    ["ER_DISK_FULL", "DATABASE_STORAGE_FULL"],
    ["ER_ACCESS_DENIED_ERROR", "DATABASE_PERMISSION_DENIED"],
    ["ER_NO_SUCH_TABLE", "DATABASE_TABLE_MISSING"],
    ["ETIMEDOUT", "DATABASE_UNAVAILABLE"],
    ["OFFICIAL_API_NOT_CONFIGURED", "OFFICIAL_API_NOT_CONFIGURED"],
    ["OFFICIAL_API_NO_PLAYERS", "OFFICIAL_API_NO_PLAYERS"],
  ])("lê a causa %s por dentro do erro do Drizzle", (code, esperado) => {
    const erro = new Error("Failed query: segredo-SQL params: chave-privada", {
      cause: Object.assign(new Error("mysql://user:password@private-host/database"), { code }),
    });
    const resultado = diagnosticoDasPartidas(erro);
    expect(resultado.errorCode).toBe(esperado);
    expect(JSON.stringify(resultado)).not.toMatch(/segredo-SQL|chave-privada|password|private-host|mysql:/);
  });

  it("aceita o número do MySQL e termina perante causas cíclicas", () => {
    expect(diagnosticoDasPartidas({ cause: { errno: 1114 } }).errorCode).toBe("DATABASE_STORAGE_FULL");
    const erro: { cause?: unknown } = {};
    erro.cause = erro;
    expect(diagnosticoDasPartidas(erro).errorCode).toBe("PARTIDAS_UNAVAILABLE");
  });

  it("uma consulta falhada rejeita em vez de fabricar zero e um sucesso vazio continua vazio", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(lerPartidasSemOcultarErro(() => Promise.reject({ code: "ETIMEDOUT" }))).rejects.toThrow("Não foi possível comunicar");
    await expect(lerPartidasSemOcultarErro(() => Promise.resolve([]))).resolves.toEqual([]);
  });
});

it("regista só códigos e categorias, sem mensagens nem parâmetros privados", () => {
  const resultado = metadadosDoErroDasPartidas(new Error("Failed query segredo", {
    cause: Object.assign(new Error("mysql://password@private SQL collation"), { code: "ER_CANT_AGGREGATE_2COLLATIONS", errno: 1267 }),
  }));
  expect(resultado).toEqual({ codigo: "ER_CANT_AGGREGATE_2COLLATIONS", numero: 1267, categoria: "collation" });
  expect(JSON.stringify(resultado)).not.toMatch(/password|private|SQL|mysql:|segredo/);
  expect(metadadosDoErroDasPartidas({code: "mysql://segredo", errno: "123"})).toEqual({});
  expect(metadadosDoErroDasPartidas({cause:{code:"ER_UNKNOWN_ERROR",errno:1105,sqlMessage:"memory quota exceeded segredo"}}).categoria).toBe("memoria");
});
