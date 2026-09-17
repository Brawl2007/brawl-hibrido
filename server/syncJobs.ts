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

    /**
     * Uma recolha que rebenta tem de deixar rasto onde se procura.
     *
     * A falha ficava só no estado do trabalho, que se lê pelo ecrã. Nos
     * registos do alojamento não aparecia nada: o pedido respondia 200, sem uma
     * linha a dizer o que tinha corrido mal. Quem fosse aos registos perceber
     * porque é que os números não mudaram não encontrava absolutamente nada — e
     * a ausência de erro parece, enganosamente, ausência de problema.
     */
    if (outcome === "error" || outcome === "timeout") {
      console.warn(`[Sync] ${name} terminou em ${outcome}: ${detalhe.error ?? "sem detalhe"}`);
    }
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

/** Tempo que um pedido interativo espera pelo trabalho antes de responder. */
export const ESPERA_INTERATIVA_MS = Number(process.env.REFRESH_WAIT_MS ?? 25_000);

/**
 * Arranca o trabalho e espera por ele — até um limite.
 *
 * POR QUE ISTO EXISTE
 *
 * O botão "Atualizar agora" arrancava a recolha e respondia já, deixando o
 * trabalho a correr em segundo plano. Num servidor que fica de pé isso é o
 * correto, e foi para isso que este módulo foi escrito.
 *
 * Num alojamento sem processo, a resposta CONGELA a instância. O trabalho
 * parava no instante em que o botão dizia "Atualização iniciada", e só avançava
 * aos soluços, quando por acaso um pedido seguinte acordasse a mesma instância.
 * Quem carregava via o botão a girar e, muitas vezes, nada a mudar.
 *
 * Aqui o pedido fica aberto a trabalhar, até ao orçamento. O que couber, fica
 * feito de verdade. O que não couber continua a ser reportado pelo estado, como
 * antes — quem chama fica a saber se acabou ou se ficou a meio.
 *
 * O orçamento é bem menor do que o tempo máximo de uma função: uma resposta
 * cortada a meio pela plataforma é pior do que uma resposta honesta a dizer
 * "ainda vou a meio".
 */
export async function arrancarEEsperar(
  name: string,
  run: () => Promise<unknown>,
  orcamentoMs: number = ESPERA_INTERATIVA_MS,
) {
  const arranque = startSyncJob(name, run);
  let alarme: ReturnType<typeof setTimeout> | undefined;
  const tempoEsgotado = new Promise<void>((resolve) => {
    alarme = setTimeout(resolve, orcamentoMs);
    (alarme as unknown as { unref?: () => void })?.unref?.();
  });
  try {
    await Promise.race([esperarPeloTrabalho(name), tempoEsgotado]);
  } finally {
    if (alarme) clearTimeout(alarme);
  }
  const state = getSyncJobState(name);
  return { ...arranque, state, concluido: !state.running };
}

/** Só para testes: esquece todo o estado acumulado. */
export function resetSyncJobsForTests() {
  for (const entry of jobs.values()) {
    if (entry.watchdog) clearTimeout(entry.watchdog);
  }
  jobs.clear();
}

/**
 * Espera pelo fim do trabalho em curso, se houver.
 *
 * Isto era só para testes, e passou a ser preciso a sério. O feitio normal
 * deste módulo — o pedido ARRANCA o trabalho e responde já — supõe um servidor
 * que fica de pé a trabalhar depois de responder. Numa função sem processo, a
 * resposta congela tudo: quem arranca e responde nunca vê o trabalho acabar.
 *
 * Uma recolha periódica nesse alojamento tem de esperar antes de responder, e é
 * para isso que isto serve. O estado continua a ser publicado da mesma maneira,
 * por isso o ecrã não muda.
 */
export async function esperarPeloTrabalho(name: string) {
  await jobs.get(name)?.promise;
}

/** @deprecated Usa `esperarPeloTrabalho`. Mantido pelos testes que já o chamam. */
export const awaitSyncJobForTests = esperarPeloTrabalho;
