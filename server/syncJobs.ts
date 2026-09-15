/**
 * Trabalhos de sincronização em segundo plano.
 *
 * POR QUE ISTO EXISTE
 *
 * O botão "Atualizar agora" chamava `syncCounterData` DENTRO do pedido HTTP e
 * esperava que ele terminasse. Enquanto a recolha do BrawlScope falhava depressa
 * (o índice já não publicava os endereços das fichas), isso passava despercebido:
 * o pedido devolvia em segundos porque quase não fazia trabalho nenhum.
 *
 * Quando a recolha voltou a funcionar, o mesmo botão passou a esperar por ~750
 * pedidos espaçados a 120 ms, mais o PL Prodigy e o Brawl Planet. São minutos.
 * Nenhum gateway mantém um pedido aberto durante minutos, e nenhuma pessoa
 * percebe um botão que gira sem fim. O bug não foi a recolha ter voltado: foi
 * haver trabalho longo à espera dentro de um pedido curto.
 *
 * A regra que este módulo impõe: um pedido HTTP ARRANCA o trabalho e responde
 * já; o progresso consulta-se à parte. Três garantias que o botão precisa:
 *
 *  1. Arrancar duas vezes não corre duas vezes — a segunda chamada devolve o
 *     trabalho em curso.
 *  2. Um trabalho tem sempre fim: o watchdog marca-o como expirado passado o
 *     tempo máximo, mesmo que a promessa nunca resolva. O ecrã nunca fica preso.
 *  3. Uma falha nunca derruba o processo — fica gravada no estado.
 */

export type SyncJobState = {
  name: string;
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  /** Descrição curta do passo atual, para o ecrã não ter de adivinhar. */
  progress: string | null;
  outcome: "success" | "error" | "timeout" | null;
  error: string | null;
  /** Resultado devolvido pelo trabalho, quando correu bem. */
  result: unknown;
};

/** Tempo máximo de um trabalho antes de ser dado como expirado. */
export const SYNC_JOB_TIMEOUT_MS = Number(process.env.SYNC_JOB_TIMEOUT_MS ?? 12 * 60 * 1000);

type JobEntry = SyncJobState & { promise?: Promise<void>; watchdog?: ReturnType<typeof setTimeout> };

const jobs = new Map<string, JobEntry>();

function emptyState(name: string): JobEntry {
  return { name, running: false, startedAt: null, finishedAt: null, progress: null, outcome: null, error: null, result: null };
}

function entryFor(name: string) {
  const existing = jobs.get(name);
  if (existing) return existing;
  const criado = emptyState(name);
  jobs.set(name, criado);
  return criado;
}

/** Estado público de um trabalho, sem a promessa nem o temporizador. */
export function getSyncJobState(name: string): SyncJobState {
  const { promise: _promise, watchdog: _watchdog, ...estado } = entryFor(name);
  return estado;
}

export function listSyncJobStates(names: readonly string[]): Record<string, SyncJobState> {
  return Object.fromEntries(names.map((name) => [name, getSyncJobState(name)]));
}

/**
 * Saúde do processo: há quanto tempo está de pé e quanta memória usa.
 *
 * Serve para distinguir duas coisas que se parecem uma com a outra no ecrã. Um
 * site que responde "Service Unavailable" pode estar em baixo por uma razão
 * pontual, ou pode estar a reiniciar em ciclo — e nesse caso o tempo de vida
 * nunca passa de alguns segundos. Sem este número, as duas situações levam à
 * mesma pergunta sem resposta.
 */
export function getProcessHealth() {
  const memoria = typeof process !== "undefined" && typeof process.memoryUsage === "function"
    ? process.memoryUsage()
    : undefined;
  return {
    uptimeSeconds: typeof process !== "undefined" && typeof process.uptime === "function" ? Math.round(process.uptime()) : null,
    heapUsedMb: memoria ? Math.round(memoria.heapUsed / 1024 / 1024) : null,
    rssMb: memoria ? Math.round(memoria.rss / 1024 / 1024) : null,
  };
}

/** Atualiza a linha de progresso de um trabalho em curso. */
export function reportSyncJobProgress(name: string, progress: string) {
  const entry = jobs.get(name);
  if (entry?.running) entry.progress = progress;
}

export type StartSyncJobResult = {
  started: boolean;
  alreadyRunning: boolean;
  state: SyncJobState;
};

/**
 * Arranca o trabalho e devolve imediatamente. Nunca lança: uma falha do trabalho
 * fica no estado, porque quem chamou já respondeu ao cliente há muito tempo.
 */
export function startSyncJob(
  name: string,
  run: () => Promise<unknown>,
  /** Só os testes passam isto; em produção vale `SYNC_JOB_TIMEOUT_MS`. */
  timeoutMs: number = SYNC_JOB_TIMEOUT_MS,
): StartSyncJobResult {
  const entry = entryFor(name);
  if (entry.running) {
    return { started: false, alreadyRunning: true, state: getSyncJobState(name) };
  }

  entry.running = true;
  entry.startedAt = new Date().toISOString();
  entry.finishedAt = null;
  entry.outcome = null;
  entry.error = null;
  entry.result = null;
  entry.progress = "a começar";

  const terminar = (outcome: SyncJobState["outcome"], detalhe: { error?: string; result?: unknown }) => {
    // Só o primeiro a chegar decide: se o watchdog já fechou o trabalho, um
    // resultado tardio não o pode reabrir nem reescrever.
    if (!entry.running) return;
    entry.running = false;
    entry.finishedAt = new Date().toISOString();
    entry.outcome = outcome;
    entry.error = detalhe.error ?? null;
    entry.result = detalhe.result ?? null;
    entry.progress = null;
    if (entry.watchdog) clearTimeout(entry.watchdog);
    entry.watchdog = undefined;
  };

  entry.watchdog = setTimeout(() => {
    terminar("timeout", { error: `Sem conclusão após ${Math.max(1, Math.round(timeoutMs / 60_000))} minutos; o trabalho pode continuar em segundo plano.` });
  }, timeoutMs);
  // Não prender o processo por causa do watchdog. O `unref` só existe no Node;
  // o cast evita depender dos tipos do runtime para isto compilar.
  (entry.watchdog as unknown as { unref?: () => void } | undefined)?.unref?.();

  entry.promise = (async () => {
    try {
      const result = await run();
      terminar("success", { result });
    } catch (error) {
      terminar("error", { error: error instanceof Error ? error.message : String(error) });
    }
  })();

  return { started: true, alreadyRunning: false, state: getSyncJobState(name) };
}

/** Só para testes: esquece todo o estado acumulado. */
export function resetSyncJobsForTests() {
  for (const entry of jobs.values()) {
    if (entry.watchdog) clearTimeout(entry.watchdog);
  }
  jobs.clear();
}

/** Só para testes: espera pelo fim do trabalho em curso, se houver. */
export async function awaitSyncJobForTests(name: string) {
  await jobs.get(name)?.promise;
}
