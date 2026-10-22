import { describe, expect, it, vi } from "vitest";
import { consultarEspacoDasTabelas, consultarModoDeLeitura, fornecedorDaBase } from "./estadoDaBase";

describe("diagnóstico da base sem expor segredos nem alterar o servidor", () => {
  it("identifica o fornecedor sem devolver o host, a conta ou a palavra-passe", () => {
    expect(fornecedorDaBase("mysql://user:segredo@servico.aivencloud.com:1234/base")).toBe("aiven");
    expect(fornecedorDaBase("mysql://u:p@db.tidbcloud.com/base")).toBe("tidb");
    expect(fornecedorDaBase("mysql://u:p@db.psdb.cloud/base")).toBe("planetscale");
    expect(fornecedorDaBase("mysql://u:p@db.aivencloud.com.exemplo.org/base")).toBe("outro");
    expect(fornecedorDaBase(undefined)).toBe("desconhecido");
  });

  it("confirma bloqueio quando qualquer uma das proteções está ligada", async () => {
    const executar = vi.fn(async () => [[{ Variable_name: "read_only", Value: "OFF" }, { Variable_name: "super_read_only", Value: "ON" }], []]);
    await expect(consultarModoDeLeitura(executar)).resolves.toBe(true);
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it("distingue OFF de ausência de diagnóstico", async () => {
    await expect(consultarModoDeLeitura(async () => [[{ Variable_name: "read_only", Value: "OFF" }], []])).resolves.toBe(false);
    await expect(consultarModoDeLeitura(async () => [[], []])).resolves.toBeNull();
    await expect(consultarModoDeLeitura(async () => { throw new Error("negado"); })).resolves.toBeNull();
  });

  it("mede dados, índices e espaço livre por tabela sem ler o conteúdo", async () => {
    const executar = vi.fn(async () => [[{ tabela: "observed_battles", dados: "200", indices: "100", livre: "50", linhas: "752266" }], []]);
    await expect(consultarEspacoDasTabelas(executar)).resolves.toEqual([
      { tabela: "observed_battles", dados: 200, indices: 100, livre: 50, linhas: 752266 },
    ]);
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it("não inventa tamanhos quando a consulta não está disponível", async () => {
    await expect(consultarEspacoDasTabelas(async () => { throw new Error("negado"); })).resolves.toBeNull();
  });
});
