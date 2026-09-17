import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const recolhas = vi.hoisted(() => ({ ranked: 0, counters: 0, demoraMs: 0 }));
vi.mock("./rankedSync", () => ({
  syncRankedData: vi.fn(async () => {
    recolhas.ranked += 1;
    if (recolhas.demoraMs) await new Promise((r) => setTimeout(r, recolhas.demoraMs));
    return { ok: true };
  }),
}));
vi.mock("./counterSync", () => ({ syncCounterData: vi.fn(async () => { recolhas.counters += 1; return { ok: true }; }) }));
vi.mock("./arranque", () => ({ garantirArranque: vi.fn(async () => undefined) }));

import { handleCronSync } from "./cronSync";
import { resetSyncJobsForTests } from "./syncJobs";

function pedido(auth?: string, query: Record<string, string> = {}) {
  return { headers: auth ? { authorization: auth } : {}, query } as never;
}
function resposta() {
  const dados: { status: number; body: unknown } = { status: 200, body: null };
  const res = {
    status(codigo: number) { dados.status = codigo; return res; },
    json(body: unknown) { dados.body = body; return res; },
  };
  return { res: res as never, dados };
}

describe("recolha periódica na Vercel", () => {
  beforeEach(() => {
    recolhas.ranked = 0; recolhas.counters = 0; recolhas.demoraMs = 0;
    resetSyncJobsForTests();
    process.env.CRON_SECRET = "segredo-de-teste";
    delete process.env.CRON_SYNC_COUNTERS;
  });

  it("recusa sem segredo definido, para ninguém poder mandar recolher", async () => {
    delete process.env.CRON_SECRET;
    const { res, dados } = resposta();
    await handleCronSync(pedido("Bearer seja-o-que-for"), res);
    expect(dados.status).toBe(503);
    expect(recolhas.ranked).toBe(0);
  });

  it.each([
    ["sem cabeçalho", undefined],
    ["com segredo errado", "Bearer errado"],
    ["sem o prefixo Bearer", "segredo-de-teste"],
  ])("recusa %s", async (_, auth) => {
    const { res, dados } = resposta();
    await handleCronSync(pedido(auth), res);
    expect(dados.status).toBe(401);
    expect(recolhas.ranked).toBe(0);
  });

  /**
   * A propriedade que faz esta rota existir.
   *
   * O resto do site arranca o trabalho e responde já — e numa função a resposta
   * congela o processo, por isso o trabalho nunca acabava. Aqui a resposta só
   * sai depois de a recolha terminar.
   */
  it("espera pela recolha antes de responder", async () => {
    recolhas.demoraMs = 30;
    const { res, dados } = resposta();
    await handleCronSync(pedido("Bearer segredo-de-teste"), res);
    expect(recolhas.ranked).toBe(1);
    expect(dados.body).toMatchObject({ ok: true, ranked: "ok" });
  });

  it("não recolhe counters sem pedido explícito: não cabem no tempo de uma função", async () => {
    const { res, dados } = resposta();
    await handleCronSync(pedido("Bearer segredo-de-teste"), res);
    expect(recolhas.counters).toBe(0);
    expect(dados.body).toMatchObject({ counters: "ignorado" });
  });

  it.each([
    ["por parâmetro", () => pedido("Bearer segredo-de-teste", { counters: "1" })],
    ["por variável de ambiente", () => { process.env.CRON_SYNC_COUNTERS = "true"; return pedido("Bearer segredo-de-teste"); }],
  ])("recolhe counters quando pedido %s", async (_, montar) => {
    const { res, dados } = resposta();
    await handleCronSync(montar(), res);
    expect(recolhas.counters).toBe(1);
    expect(dados.body).toMatchObject({ counters: "ok" });
  });

  it("o cron está declarado e aponta para a rota que existe", () => {
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    expect(vercel.crons).toEqual([{ path: "/api/cron/sync", schedule: "0 5 * * *" }]);

    /**
     * `functions` no topo INVALIDA a configuração deste projeto.
     *
     * Num projeto com `services`, essa propriedade pertence a dentro de cada
     * serviço. Posta no topo, a Vercel recusa o ficheiro e falha o deploy antes
     * sequer de o criar: o painel diz "Deployment failed" e a lista de deploys
     * fica vazia, como se nada tivesse sido tentado. Custou horas a encontrar
     * precisamente porque não deixa rasto onde se procura primeiro.
     */
    expect(vercel).not.toHaveProperty("functions");
    expect(vercel.services).toBeDefined();
    // As DUAS entradas servem a rota: a de sempre e a da Vercel.
    for (const entrada of ["server/_core/index.ts", "server/_core/index.vercel.ts"]) {
      expect(readFileSync(resolve(process.cwd(), entrada), "utf8")).toContain('app.get("/api/cron/sync", handleCronSync)');
    }
  });
});
