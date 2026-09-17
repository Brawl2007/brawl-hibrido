import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  awaitSyncJobForTests,
  getSyncJobState,
  reportSyncJobProgress,
  resetSyncJobsForTests,
  startSyncJob,
  getProcessHealth,
} from "./syncJobs";

/**
 * A avaria que estes testes existem para não deixar voltar.
 *
 * "Atualizar agora" chamava a sincronização dentro do pedido HTTP e esperava
 * por ela. Enquanto a recolha do BrawlScope falhava depressa, o pedido devolvia
 * em segundos. Quando a recolha voltou a funcionar — ~750 pedidos espaçados —
 * o mesmo botão passou a esperar minutos, o gateway fechava a ligação, e o
 * botão ficava a girar para sempre.
 *
 * A regra é esta: o pedido ARRANCA o trabalho e responde já.
 */
describe("trabalhos de sincronização em segundo plano", () => {
  beforeEach(() => resetSyncJobsForTests());
  afterEach(() => resetSyncJobsForTests());

  it("arranca e devolve imediatamente, sem esperar pelo trabalho", async () => {
    let terminou = false;
    const resultado = startSyncJob("teste", async () => {
      await new Promise((cumprir) => setTimeout(cumprir, 30));
      terminou = true;
      return { ok: true };
    });

    // O ponto todo: quando `startSyncJob` devolve, o trabalho ainda corre.
    expect(resultado.started).toBe(true);
    expect(terminou).toBe(false);
    expect(getSyncJobState("teste").running).toBe(true);

    await awaitSyncJobForTests("teste");
    expect(getSyncJobState("teste")).toMatchObject({ running: false, outcome: "success", result: { ok: true } });
  });

  it("arrancar duas vezes não corre duas vezes", async () => {
    let execucoes = 0;
    const trabalho = async () => { execucoes += 1; await new Promise((cumprir) => setTimeout(cumprir, 20)); };

    const primeiro = startSyncJob("teste", trabalho);
    const segundo = startSyncJob("teste", trabalho);

    expect(primeiro.started).toBe(true);
    expect(segundo.started).toBe(false);
    expect(segundo.alreadyRunning).toBe(true);

    await awaitSyncJobForTests("teste");
    expect(execucoes).toBe(1);
  });

  it("uma falha fica registada e não derruba nada", async () => {
    startSyncJob("teste", async () => { throw new Error("a fonte recusou"); });
    await awaitSyncJobForTests("teste");

    expect(getSyncJobState("teste")).toMatchObject({ running: false, outcome: "error", error: "a fonte recusou" });
  });

  it("o trabalho tem sempre fim: o watchdog fecha-o mesmo que nunca resolva", async () => {
    // Uma promessa que nunca cumpre — o caso exato que prendia o botão.
    startSyncJob("teste", () => new Promise<void>(() => undefined), 30);
    expect(getSyncJobState("teste").running).toBe(true);

    await new Promise((cumprir) => setTimeout(cumprir, 80));

    const estado = getSyncJobState("teste");
    expect(estado.running).toBe(false);
    expect(estado.outcome).toBe("timeout");
  });

  it("um resultado tardio não reabre um trabalho que o watchdog já fechou", async () => {
    let cumprir: (() => void) | undefined;
    startSyncJob("teste", () => new Promise<void>((resolver) => { cumprir = resolver; }), 30);

    await new Promise((seguir) => setTimeout(seguir, 80));
    expect(getSyncJobState("teste").outcome).toBe("timeout");

    cumprir?.();
    await new Promise((seguir) => setTimeout(seguir, 20));
    // Continua expirado: o primeiro a fechar é quem manda.
    expect(getSyncJobState("teste").outcome).toBe("timeout");
    expect(getSyncJobState("teste").running).toBe(false);
  });

  it("o progresso só é escrito enquanto o trabalho corre", async () => {
    startSyncJob("teste", async () => { await new Promise((cumprir) => setTimeout(cumprir, 20)); });
    reportSyncJobProgress("teste", "BrawlScope · vista 3/7");
    expect(getSyncJobState("teste").progress).toBe("BrawlScope · vista 3/7");

    await awaitSyncJobForTests("teste");
    reportSyncJobProgress("teste", "tarde demais");
    expect(getSyncJobState("teste").progress).toBeNull();
  });
});

describe("o botão de atualizar não pode esperar dentro do pedido", () => {
  it("os endpoints de refresh arrancam um trabalho em vez de esperar pela recolha", () => {
    const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

    expect(routers).toContain("startSyncJob(RANKED_SYNC_JOB");
    expect(routers).toContain("startSyncJob(COUNTER_SYNC_JOB");
    // Esperar pela recolha dentro da mutação foi exatamente o que prendeu o botão.
    expect(routers).not.toMatch(/return\s+syncCounterData\("manual"\)/);
    expect(routers).not.toMatch(/return\s+syncRankedData\("manual"\)/);
    // E tem de haver por onde perguntar o estado.
    expect(routers).toContain("syncJobs: router(");
  });

  it("as três páginas usam o mesmo hook — foi a cópia que deixou duas para trás", () => {
    for (const pagina of ["client/src/pages/Draft.tsx", "client/src/pages/Home.tsx", "client/src/pages/Brawlers.tsx"]) {
      const fonte = readFileSync(resolve(process.cwd(), pagina), "utf8");
      expect(fonte).toContain("useSyncRefresh()");
      // Ninguém volta a ler um resultado que o servidor já não devolve.
      expect(fonte).not.toContain("trpc.counterSync.refresh.useMutation");
      expect(fonte).not.toContain("trpc.rankedSync.refresh.useMutation");
    }
  });

  it("o hook tem um teto local, para o botão não depender do servidor responder", () => {
    const hook = readFileSync(resolve(process.cwd(), "client/src/lib/useSyncRefresh.ts"), "utf8");

    expect(hook).toContain("REFRESH_HARD_CAP_MS");
    expect(hook).toMatch(/Date\.now\(\) - requestedAt > REFRESH_HARD_CAP_MS/);
    // O estado de espera tem de poder ser desligado pelo teto, não só pelo servidor.
    expect(hook).toMatch(/!expired && running/);
  });
});

/**
 * A sonda de diagnóstico.
 *
 * Existe por causa do modo de falha que nenhum erro apanha: a página é
 * descarregada com sucesso, o parser não reconhece nada lá dentro, e a recolha
 * conclui "completa" sem trazer um único número novo. Foi assim que os counters
 * ficaram parados sem nada no ecrã a dizer porquê.
 */
describe("diagnóstico das fontes", () => {
  it("é exposto como mutação protegida e limitado a admin", () => {
    const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

    expect(routers).toContain("probe: protectedProcedure.mutation");
    expect(routers).toContain("probeAllSources()");
    // Faz pedidos externos: não pode ficar aberto a qualquer visitante, nem a
    // um utilizador autenticado que não seja o dono.
    expect(routers).toMatch(/probe: protectedProcedure[\s\S]{0,400}exigirDono\(ctx,/);
  });

  it("classifica cada passo, para se distinguir o que trava do que só incomoda", () => {
    const probe = readFileSync(resolve(process.cwd(), "server/sourceProbe.ts"), "utf8");

    expect(probe).toContain('"ok" | "warn" | "fail"');
    // O caso silencioso tem de ser reportado como falha, não como sucesso.
    expect(probe).toMatch(/Tabela \\"Every matchup\\"[\s\S]{0,120}"fail"/);
    expect(probe).toMatch(/Nome do brawler[\s\S]{0,80}"fail"/);
  });

  it("é diagnóstico, não recolha: uma página por fonte", () => {
    const probe = readFileSync(resolve(process.cwd(), "server/sourceProbe.ts"), "utf8");
    // Um loop sobre o roster aqui transformaria o botão numa segunda recolha.
    expect(probe).not.toMatch(/for\s*\(const\s+\w+\s+of\s+knownBrawlScopeSlugs\(\)/);
    expect(probe).not.toContain("mapWithConcurrency");
  });

  it("o botão de diagnóstico está no painel de estado das fontes", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
    expect(draftSource).toContain("Testar fontes agora");
    expect(draftSource).toContain("trpc.syncJobs.probe.useMutation");

    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    for (const classe of [".source-probe-button", ".source-probe-step", ".source-probe-card"]) {
      expect(css).toContain(classe);
    }
  });
});

/**
 * Manter o site de pé quando a recolha falha.
 *
 * Desde o Node 18 uma promessa rejeitada sem tratamento mata o processo. A
 * recolha corre em segundo plano, fora de qualquer pedido — uma falha lá dentro
 * derrubava o servidor inteiro, e o utilizador via "Service Unavailable" em
 * todas as páginas, incluindo as que não dependiam de recolha nenhuma.
 */
describe("o servidor não pode cair por causa da recolha", () => {
  it("regista falhas de fundo em vez de deixar o processo morrer", () => {
    const boot = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");

    expect(boot).toContain('process.on("unhandledRejection"');
    expect(boot).toContain('process.on("uncaughtException"');
    // Nenhum dos dois pode terminar o processo.
    const guardas = boot.slice(boot.indexOf('process.on("unhandledRejection"'));
    expect(guardas.slice(0, guardas.indexOf("startServer("))).not.toContain("process.exit");
  });

  it("uma falha no arranque continua a ser fatal, com mensagem", () => {
    const boot = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");
    // Sem servidor não há nada para servir: falhar claramente é melhor do que
    // ficar meio de pé a responder erros.
    // Os parênteses aceitam argumento: o arranque passou a receber o servidor.
    // O que este teste guarda é a falha ser fatal, não a forma da chamada.
    expect(boot).toMatch(/startServer\([^)]*\)\.catch\([\s\S]{0,300}process\.exit\(1\)/);
  });

  it("reporta o tempo de vida do processo, que é o que denuncia um ciclo de reinícios", () => {
    const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(routers).toContain("getProcessHealth()");

    const estado = getProcessHealth();
    expect(estado.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(estado.rssMb).toBeGreaterThan(0);
  });

  it("não declara Accept-Encoding à mão: isso devolvia bytes comprimidos ao parser", () => {
    const sync = readFileSync(resolve(process.cwd(), "server/counterSync.ts"), "utf8");
    expect(sync).not.toMatch(/"Accept-Encoding"\s*:/);
  });
});

/**
 * Diagnosticar não pode piorar o problema.
 *
 * O botão "Testar fontes agora" ignora o bloqueio para poder tentar — mas cada
 * tentativa falhada contava como mais uma falha consecutiva e DUPLICAVA a
 * espera. Três cliques levaram uma espera de 10 minutos a 160. Quem estava a
 * tentar perceber a avaria estava a agravá-la, sem forma nenhuma de o saber.
 */
describe("o recuo das fontes", () => {
  const sync = readFileSync(resolve(process.cwd(), "server/counterSync.ts"), "utf8");

  it("um pedido de diagnóstico não regista falha nem duplica a espera", () => {
    expect(sync).toContain("const registar = options?.ignoreBlock ? () => 0 : registarBloqueio;");
    // Nenhum dos caminhos de recusa pode continuar a chamar o registo diretamente.
    expect(sync).not.toMatch(/throw new SourceBlockedError\(host, response\.status, registarBloqueio\(/);
  });

  it("o teto do recuo deixou de ser de horas", () => {
    // Uma recusa persistente não é sobrecarga: esperar 6 horas não abre a porta.
    expect(sync).toMatch(/BLOQUEIO_MAXIMO_MS = Number\(process\.env\.BRAWLSCOPE_MAX_BACKOFF_MS \?\? 60 \* 60 \* 1000\)/);
  });

  it("há forma de esquecer o recuo sem esperar", () => {
    expect(sync).toContain("export function limparBloqueio(");

    const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(routers).toContain("clearBackoff: protectedProcedure");
    expect(routers).toMatch(/clearBackoff[\s\S]{0,300}exigirDono\(ctx,/);

    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
    expect(draftSource).toContain("Limpar espera das fontes");
  });
});
