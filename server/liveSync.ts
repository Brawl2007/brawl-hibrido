import { startSyncJob } from "./syncJobs";
import { RANKED_SYNC_JOB } from "./syncJobNames";
import { restoreBrawlScopeMatchupMatrices, syncCounterData } from "./counterSync";
import { syncRankedData } from "./rankedSync";
import { collectObservedRankedMatches } from "./observedMatchCollection";
import { isOfficialApiConfigured } from "./brawlStarsApi";
import { garantirArranque } from "./arranque";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;

let timer: ReturnType<typeof setInterval> | undefined;
let initialTimer: ReturnType<typeof setTimeout> | undefined;
let activeCycle: Promise<void> | undefined;

function readIntervalMs() {
  const configured = Number(process.env.BRAWL_LIVE_SYNC_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(configured)) return DEFAULT_INTERVAL_MS;
  return Math.max(MIN_INTERVAL_MS, Math.floor(configured));
}

export function getLiveSyncIntervalMs() {
  return readIntervalMs();
}

export function isLiveSyncEnabled() {
  return process.env.BRAWL_LIVE_SYNC_ENABLED === "true";
}

/**
 * Executa os dois snapshots em série para não sobrecarregar as fontes públicas.
 * Um ciclo em andamento é partilhado por chamadas concorrentes (manual + timer).
 */
export function runLiveSyncCycle(trigger: "scheduled" | "bootstrap" = "scheduled") {
  if (activeCycle) return activeCycle;

  activeCycle = (async () => {
    let ranked: { ok: boolean; error?: string } = { ok: false, error: "não executado" };
    let counters: { ok: boolean; error?: string } = { ok: false, error: "não executado" };
    try {
      ranked = await syncRankedData(trigger);
      if (!ranked.ok) console.warn(`[LiveSync] Ranked não atualizado: ${ranked.error}`);
    } catch (error) {
      ranked.error = error instanceof Error ? error.message : String(error);
      console.error(`[LiveSync] Falha inesperada no Ranked; servidor continua ativo: ${ranked.error}`);
    }

    try {
      counters = await syncCounterData(trigger);
      if (!counters.ok) console.warn(`[LiveSync] Counters não atualizados: ${counters.error}`);
    } catch (error) {
      counters.error = error instanceof Error ? error.message : String(error);
      console.error(`[LiveSync] Falha inesperada nos Counters; servidor continua ativo: ${counters.error}`);
    }

    /**
     * Recolha de batalhas Ranked reais.
     *
     * Esta parte já existia inteira — amostra de jogadores do topo, leitura do
     * histórico de combates, deduplicação por impressão digital, agregação por
     * mapa e modo — mas só corria a partir de uma tarefa agendada externa que
     * nunca chegou a ser registada. Ou seja: nunca correu. A tabela de
     * confrontos observados ficou vazia desde sempre, e o Draft dizia
     * "Ainda não altera o Score" sobre dados que não existiam.
     *
     * Ligada aqui, passa a acumular a cada ciclo. É esta a resposta ao
     * BrawlScope ter fechado a porta: em vez de depender de quem nos pode
     * recusar, o site constrói a sua própria matriz a partir de jogos reais —
     * e por MAPA, que é mais fino do que o por modo que se perdeu.
     *
     * Corre em último lugar de propósito: é a parte que pode faltar sem
     * prejudicar nada do que já está no ecrã.
     */
    let observadas: { ok: boolean; error?: string; battlesInserted?: number } = { ok: false, error: "não executado" };
    if (isOfficialApiConfigured()) {
      try {
        observadas = await collectObservedRankedMatches(trigger === "bootstrap" ? "bootstrap" : "scheduled");
        if (!observadas.ok) console.warn(`[LiveSync] Batalhas observadas não recolhidas: ${observadas.error}`);
      } catch (error) {
        observadas.error = error instanceof Error ? error.message : String(error);
        console.error(`[LiveSync] Falha inesperada nas batalhas observadas; servidor continua ativo: ${observadas.error}`);
      }
    } else {
      observadas.error = "sem chave da API oficial";
    }

    if (ranked.ok || counters.ok || observadas.ok) {
      console.log(
        `[LiveSync] ciclo concluído · ranked=${ranked.ok ? "ok" : "falhou"} · counters=${counters.ok ? "ok" : "falhou"} · batalhas=${observadas.ok ? `+${observadas.battlesInserted ?? 0}` : "falhou"}`,
      );
    }
  })().finally(() => {
    activeCycle = undefined;
  });

  return activeCycle;
}

/**
 * Mantém o processo sincronizando em background. O primeiro ciclo ocorre após
 * o servidor subir; os seguintes usam o intervalo configurado, com mínimo de 1
 * minuto para evitar loops agressivos contra as fontes públicas.
 */
export function startLiveSync() {
  if (timer || initialTimer) return () => undefined;

  const intervalMs = readIntervalMs();

  /**
   * Antes do primeiro ciclo, recupera as matrizes por modo que ficaram gravadas.
   * A recolha lê uma vista por ciclo, por isso reconstruir as sete do zero
   * demora quase duas horas — tempo durante o qual a leitura "Por modo" do
   * Draft funcionaria com o catálogo geral sem o dizer a ninguém.
   */
  /**
   * A chave da API oficial pode estar guardada na base de dados, quando não há
   * acesso às variáveis de ambiente do alojamento. É carregada antes do primeiro
   * ciclo para a recolha de batalhas não arrancar cega.
   */
  /**
   * As tabelas e a chave guardada, pelo mesmo caminho que a Vercel usa. Ter
   * duas cópias deste arranque foi precisamente o que deixou a entrada da
   * Vercel para trás quando uma tabela nova apareceu no instalador.
   */
  void garantirArranque();

  void restoreBrawlScopeMatchupMatrices()
    .then(({ views, pairs }) => {
      if (pairs) console.log(`[LiveSync] Matrizes por modo recuperadas da última snapshot: ${views} vistas, ${pairs} pares.`);
    })
    .catch(() => undefined);

  if (!isLiveSyncEnabled()) {
    if (process.env.BRAWL_RANKED_SYNC_ENABLED !== "false") {
      const refreshRanked = () => startSyncJob(RANKED_SYNC_JOB, () => syncRankedData("scheduled"));
      initialTimer = setTimeout(() => { initialTimer = undefined; refreshRanked(); }, 30_000);
      timer = setInterval(refreshRanked, 60 * 60 * 1000);
      console.log("[LiveSync] Ranqueada automática a cada hora; counters por importação.");
      return () => {
        if (initialTimer) clearTimeout(initialTimer);
        if (timer) clearInterval(timer);
        initialTimer = undefined; timer = undefined;
      };
    }
    console.log("[LiveSync] Modo manual: dados guardados recuperados, coleta automática desativada.");
    return () => undefined;
  }

  initialTimer = setTimeout(() => {
    initialTimer = undefined;
    void runLiveSyncCycle("bootstrap");
  }, 1_000);
  timer = setInterval(() => {
    void runLiveSyncCycle("scheduled");
  }, intervalMs);

  console.log(`[LiveSync] ativo · atualização a cada ${Math.round(intervalMs / 60_000)} min`);

  return () => {
    if (initialTimer) clearTimeout(initialTimer);
    if (timer) clearInterval(timer);
    initialTimer = undefined;
    timer = undefined;
  };
}

export function getLiveSyncState() {
  return {
    enabled: isLiveSyncEnabled(),
    rankedEnabled: isLiveSyncEnabled() || process.env.BRAWL_RANKED_SYNC_ENABLED !== "false",
    intervalMs: readIntervalMs(),
    running: Boolean(activeCycle),
  };
}
