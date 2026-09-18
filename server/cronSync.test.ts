import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const recolhas = vi.hoisted(() => ({ ranked: 0, counters: 0, demoraMs: 0, fechadas: 0, nuncaAcaba: false, guardado: [] as Array<[string, string]> }));
vi.mock("./rankedSync", () => ({
  syncRankedData: vi.fn(async () => {
    recolhas.ranked += 1;
    // Uma recolha que nunca volta é o que aconteceu na produção às 05:01.
    if (recolhas.nuncaAcaba) await new Promise(() => {});
    if (recolhas.demoraMs) await new Promise((r) => setTimeout(r, recolhas.demoraMs));
    return { ok: true };
  }),
}));
vi.mock("./counterSync", () => ({ syncCounterData: vi.fn(async () => { recolhas.counters += 1; return { ok: true }; }) }));
vi.mock("./arranque", () => ({ garantirArranque: vi.fn(async () => undefined) }));
vi.mock("./db", () => ({ fecharExecucoesAbandonadas: vi.fn(async () => recolhas.fechadas) }));
vi.mock("./appSettings", () => ({
  setSetting: vi.fn(async (chave: string, valor: string) => { recolhas.guardado.push([chave, valor]); }),
}));

import { handleCronSync } from "./cronSync";
import { resetSyncJobsForTests } from "./syncJobs";
import { CRON_DA_RECOLHA } from "@shared/agendamento";
import { RECOLHA_AUTOMATICA_SETTING, avisoDaRecolha, lerRecolhaAutomatica } from "@shared/recolhaAutomatica";

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
    recolhas.ranked = 0; recolhas.counters = 0; recolhas.demoraMs = 0; recolhas.fechadas = 0;
    recolhas.nuncaAcaba = false; recolhas.guardado = [];
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

  /**
   * Os counters estavam desligados no automático, e ninguém o via.
   *
   * O motivo dado era "centenas de páginas, não cabem no tempo de uma função".
   * Isso descrevia a recolha COM o BrawlScope, que desta rede nem responde — a
   * parte cara falha depressa e os dados dela entram por captura no navegador.
   * O que sobrava eram as relações e sinergias do Brawl Planet, a única fonte
   * de counters que responde daqui, e ficavam paradas até alguém carregar no
   * botão.
   */
  it("recolhe counters no automático, sem ninguém ter de os pedir", async () => {
    const { res, dados } = resposta();
    await handleCronSync(pedido("Bearer segredo-de-teste"), res);
    expect(recolhas.counters).toBe(1);
    expect(dados.body).toMatchObject({ counters: "ok" });
  });

  it.each([
    ["por parâmetro", () => pedido("Bearer segredo-de-teste", { counters: "0" })],
    ["por variável de ambiente", () => { process.env.CRON_SYNC_COUNTERS = "false"; return pedido("Bearer segredo-de-teste"); }],
  ])("deixa desligar os counters %s, sem publicar nada", async (_, montar) => {
    const { res, dados } = resposta();
    await handleCronSync(montar(), res);
    expect(recolhas.counters).toBe(0);
    expect(dados.body).toMatchObject({ counters: "desligado" });
    // A ranqueada continua: desligar os counters não desliga a recolha toda.
    expect(recolhas.ranked).toBe(1);
  });

  /**
   * Começar sem tempo é pior do que não começar.
   *
   * Uma recolha cortada a meio não grava nada — a função é morta sem aviso e o
   * trabalho vai todo fora. Se a ranqueada já comeu o orçamento, os counters
   * ficam para a próxima em vez de gastarem a fonte para nada.
   */
  it("não começa os counters quando já não sobra tempo para os acabar", async () => {
    process.env.CRON_SYNC_BUDGET_MS = "40";
    recolhas.demoraMs = 60;
    vi.resetModules();
    const { handleCronSync: comOrcamentoCurto } = await import("./cronSync");
    const { res, dados } = resposta();
    await comOrcamentoCurto(pedido("Bearer segredo-de-teste"), res);
    expect(recolhas.counters).toBe(0);
    expect(dados.body).toMatchObject({ counters: "sem-tempo" });
    delete process.env.CRON_SYNC_BUDGET_MS;
  });

  /**
   * Uma execução morta a meio nunca escreve o fim dela e fica "a correr" para
   * sempre. O painel mostrava uma sincronização em curso que não existia há
   * dias — e um "a correr" convida a esperar, enquanto uma falha convida a ir
   * ver. Fechá-las antes de começar é o que torna o painel legível.
   */
  it("fecha as execuções que ficaram penduradas antes de começar", async () => {
    recolhas.fechadas = 3;
    const { res, dados } = resposta();
    await handleCronSync(pedido("Bearer segredo-de-teste"), res);
    expect(dados.body).toMatchObject({ execucoesFechadas: 3 });
  });

  /** Quanto demorou cada parte, para a decisão sobre o orçamento ter medida. */
  it("publica o tempo de cada parte, para a próxima decisão não ser um palpite", async () => {
    const { res, dados } = resposta();
    await handleCronSync(pedido("Bearer segredo-de-teste"), res);
    const corpo = dados.body as { rankedMs: number; countersMs: number; duracaoMs: number };
    expect(typeof corpo.rankedMs).toBe("number");
    expect(typeof corpo.countersMs).toBe("number");
    expect(corpo.duracaoMs).toBeGreaterThanOrEqual(0);
  });

  it("o cron está declarado e aponta para a rota que existe", () => {
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    expect(vercel.crons).toEqual([{ path: "/api/cron/sync", schedule: CRON_DA_RECOLHA }]);

    /**
     * O horário publicado tem de ser o horário a sério.
     *
     * O painel chegou a anunciar `"0 0 * * * *"` — seis campos, um cron que não
     * existe — vindo de uma coluna da base que nada lê. Esta linha é o que
     * impede a constante de se afastar outra vez do ficheiro que manda.
     */
    expect(CRON_DA_RECOLHA.trim().split(/\s+/)).toHaveLength(5);

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

  /**
   * O ORÇAMENTO TEM DE LIMITAR MESMO A ESPERA.
   *
   * Isto olhava para o relógio uma vez, antes de começar, e depois esperava
   * pela recolha sem limite nenhum. Ou seja: garantia que uma tarefa não
   * COMEÇAVA tarde demais, e nada mais do que isso.
   *
   * Na produção, a recolha agendada de 18/09 às 05:01 não voltou. A rota ficou
   * presa nela e a plataforma matou tudo aos 300 segundos — e uma função morta
   * não escreve nada: nem resposta, nem registo, nem motivo. A execução ficou
   * gravada como "a correr" 24 horas, e as únicas sincronizações desse dia
   * foram manuais.
   *
   * Sem este teste a regressão é silenciosa: tudo continua a passar, e só se
   * descobre indo ver a produção — que foi como se descobriu da primeira vez.
   */
  it("não fica preso numa recolha que nunca acaba", async () => {
    process.env.CRON_SYNC_BUDGET_MS = "50";
    recolhas.nuncaAcaba = true;
    vi.resetModules();
    const { handleCronSync: comOrcamentoCurto } = await import("./cronSync");
    const { res, dados } = resposta();

    // O que importa é CHEGAR AQUI: antes, isto nunca resolvia.
    await comOrcamentoCurto(pedido("Bearer segredo-de-teste"), res);

    expect(dados.body).toMatchObject({ ok: true, ranked: "sem-tempo" });
    // E não se gasta a fonte dos counters com o tempo já esgotado.
    expect(recolhas.counters).toBe(0);
    delete process.env.CRON_SYNC_BUDGET_MS;
  }, 5000);

  /**
   * O que a recolha fez fica onde o site o possa ler.
   *
   * Antes ia para o corpo da resposta — que só a plataforma recebe — e para o
   * `console.log`, que obriga a ir aos registos do alojamento. A recolha
   * automática podia falhar todos os dias sem o site dar um único sinal.
   */
  it("deixa por escrito o que fez, para o site o poder mostrar", async () => {
    const { res } = resposta();
    await handleCronSync(pedido("Bearer segredo-de-teste"), res);

    const [chave, valor] = recolhas.guardado.at(-1) ?? [];
    expect(chave).toBe(RECOLHA_AUTOMATICA_SETTING);
    const registo = lerRecolhaAutomatica(valor);
    expect(registo?.ranked.estado).toBe("ok");
    expect(registo?.counters.estado).toBe("ok");
    expect(registo?.orcamentoMs).toBeGreaterThan(0);
    expect(new Date(registo!.comecouEm).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("também deixa escrito quando correu mal, que é quando interessa", async () => {
    process.env.CRON_SYNC_BUDGET_MS = "50";
    recolhas.nuncaAcaba = true;
    vi.resetModules();
    const { handleCronSync: comOrcamentoCurto } = await import("./cronSync");
    const { res } = resposta();
    await comOrcamentoCurto(pedido("Bearer segredo-de-teste"), res);

    const registo = lerRecolhaAutomatica(recolhas.guardado.at(-1)?.[1]);
    expect(registo?.ranked.estado).toBe("sem-tempo");
    // E a frase que o ecrã mostra diz de onde vêm os números que se estão a ver.
    const aviso = avisoDaRecolha(registo);
    expect(aviso).toContain("não coube no tempo");
    expect(aviso).toContain("recolha anterior");
    delete process.env.CRON_SYNC_BUDGET_MS;
  }, 5000);
});
