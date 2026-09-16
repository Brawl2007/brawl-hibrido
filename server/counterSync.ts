import { applyCapturedProfiles } from "../shared/publishCaptures";
import { brawlScopeCounterData } from "../shared/brawlScopeCounterData";
import { brawlScopeSynergyData, normalizeBrawlScopeSynergyList, BRAWLSCOPE_SYNERGY_LIMIT } from "../shared/brawlScopeSynergyData";
import {
  counterRelationKey,
  uniqueCounterBrawlerNames,
  counterRelationContextKey,
  synergyRelationContextKey,
  type CounterSyncSourceStatus,
  type CounterSyncSnapshotPayload,
  type CounterSyncSourceKey,
  type CounterSyncSourceState,
  type SyncedCounterRelation,
  type SyncedSynergyRelation,
} from "../shared/counterSyncSnapshot";
import { normalizeBrawlScopeModeId, brawlScopeModes, type BrawlScopeModeId } from "../shared/brawlScopeModes";
import {
  DEFAULT_BRAWLSCOPE_RANK,
  brawlScopeIndexUrl,
  brawlScopeProfileUrl,
  describeBrawlScopeView,
} from "../shared/brawlScopeViews";
import { MIN_BRAWLSCOPE_SLUGS, resolveBrawlScopeSlugs, brawlScopeSlugFromName } from "../shared/brawlScopeSlugs";
import { looksLikeHtml, parsePastedMatchups, readBrawlScopeUrl } from "../shared/brawlScopePaste";
import { brawlScopeCaptureSchema, type BrawlScopeCapture } from "../shared/brawlScopeCapture";
import { COUNTER_SYNC_JOB } from "./syncJobNames";
import { reportSyncJobProgress } from "./syncJobs";
import { plProdigyCounterData } from "../shared/plProdigyCounterData";
import {
  PL_PRODIGY_BASE_URL,
  PL_PRODIGY_MIN_GUIDES,
  parsePLProdigyGuide,
  plProdigyGuideUrl,
  type PLProdigyGuide,
} from "../shared/plProdigyParser";
import {
  createCounterSyncRun,
  getCounterSyncSnapshot,
  insertCounterSyncEvidence,
  updateCounterSyncConfig,
  updateCounterSyncRun,
  upsertCounterSyncSnapshot,
} from "./db";
import { broadcastCounterSnapshot } from "./realtime";
import { decodeMatchupMatrices, encodeMatchupMatrices } from "../shared/matchupMatrixCodec";

const BRAWL_PLANET_BASE_URL = "https://www.brawlplanet.com";
const BRAWL_CALCULATOR_BASE_URL = "https://brawlcalculator.com";
const BRAWLSCOPE_BASE_URL = "https://brawlscope.com";
const FETCH_TIMEOUT_MS = 20_000;
const MIN_VALID_BRAWLER_COVERAGE = 100;
const DEFAULT_BRAWLSCOPE_MODE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Cache por vista. Cada ciclo renova apenas as vistas mais antigas, até um teto
 * configurável — sete vistas × 106 fichas de uma assentada seriam 742 pedidos de
 * cada vez, um ritmo que nenhuma fonte pública pequena merece. Assim o servidor
 * pede ~106 páginas por ciclo e o conjunto completa-se ao longo da hora, sem
 * nunca ficar sem dados: as vistas não renovadas continuam a valer.
 */
type BrawlScopeViewCache = {
  completedAt: number;
  relations: RelationDraft[];
  synergies: SynergyDraft[];
  brawlers: string[];
};
const brawlScopeViewCache = new Map<string, BrawlScopeViewCache>();
const DEFAULT_VIEWS_PER_CYCLE = 1;

/**
 * Matrizes completas por vista ("overall" e os seis modos), reconstruídas a cada
 * ciclo de sincronização a partir das mesmas páginas já descarregadas.
 *
 * Ficam em memória para serem servidas, e são grandes de mais para viajarem no
 * evento SSE — por isso o cliente pede a vista que quer, uma de cada vez. Mas
 * são gravadas com a snapshot no formato compacto e recarregadas no arranque:
 * a recolha faz **uma vista por ciclo de 15 minutos**, portanto sem isso cada
 * reinicialização do servidor deixava a leitura "Por modo" a funcionar com o
 * catálogo geral durante quase duas horas, sem o dizer a ninguém.
 */
const brawlScopeMatchupMatrices = new Map<string, Record<string, Record<string, number>>>();
let brawlScopeMatricesCapturedAt: string | undefined;

/**
 * A vista, seja qual for a grafia com que a peçam.
 *
 * O mesmo modo tem dois nomes no projeto: o editorial do BrawlScope
 * ("gemGrab"), com que as matrizes são guardadas, e o do Ranked ("gem-grab"),
 * com que os mapas são identificados. O cliente pedia pelo segundo e isto
 * procurava pelo primeiro, à letra — devolvia vazio, sem erro nenhum.
 *
 * Efeito: NENHUMA matriz por modo chegava ao cliente. Nem no perfil, nem no
 * Draft. Colava-se uma ficha de Pique-Gema, ela ficava bem guardada no
 * servidor, e nada mudava no ecrã porque ninguém a sabia pedir.
 */
export function normalizarVistaBrawlScope(view: string) {
  if (view === "overall") return "overall";
  return normalizeBrawlScopeModeId(view) ?? view;
}

export function getBrawlScopeMatchupMatrix(view: string) {
  return brawlScopeMatchupMatrices.get(normalizarVistaBrawlScope(view));
}

/** Instantâneo das matrizes em memória, para gravação. */
export function getBrawlScopeMatchupMatrices() {
  return Object.fromEntries(brawlScopeMatchupMatrices.entries());
}

/**
 * Remove da snapshot os campos que só existem na cópia gravada.
 *
 * É a fronteira entre o que fica na base de dados e o que sai para os
 * visitantes. Está separada numa função sua precisamente para poder ser testada:
 * um descuido aqui manda centenas de milhares de números para cada separador
 * aberto, em cada sincronização, e isso não daria erro nenhum — só um site
 * lento.
 */
export function toPublicCounterSnapshotPayload(payload: CounterSyncSnapshotPayload): CounterSyncSnapshotPayload {
  const { matchupMatrices: _apenasGravado, browserCaptures: _capturas, ...publico } = payload;
  return publico as CounterSyncSnapshotPayload;
}

/** Erros de uma fonte nunca devem transformar a interface num dump de JSON. */
function publicSourceNote(note: unknown) {
  if (typeof note !== "string") return undefined;
  const compact = note.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;
  if (compact.length > 700 || /^\s*[\[{]/.test(compact)) {
    return "A fonte devolveu um detalhe técnico muito extenso; a recolha foi interrompida e os últimos dados válidos foram mantidos.";
  }
  return compact;
}

/** Matrizes guardadas numa snapshot gravada, prontas a voltar para memória. */
export function readStoredMatchupMatrices(rawPayload?: string) {
  const parsed = parseSnapshotPayload(rawPayload);
  if (!parsed?.matchupMatrices) return { matrices: {}, capturedAt: parsed?.capturedAt };
  return {
    matrices: decodeMatchupMatrices(parsed.matchupMatrices),
    capturedAt: parsed.matchupMatrices.capturedAt ?? parsed.capturedAt,
  };
}

/**
 * Recarrega as matrizes gravadas na última snapshot.
 *
 * Corre no arranque, antes da primeira recolha. Uma vista que a recolha volte a
 * ler é substituída pela leitura nova; as outras continuam a valer o que a
 * snapshot guardou, que é muito melhor do que nada. Devolve o que recuperou,
 * para o arranque o poder registar.
 */
export async function restoreBrawlScopeMatchupMatrices() {
  try {
    const snapshot = await getCounterSyncSnapshot();
    if (!snapshot?.payload) return { views: 0, pairs: 0 };
    const { matrices, capturedAt } = readStoredMatchupMatrices(snapshot.payload);
    const capturedProfiles = parseSnapshotPayload(snapshot.payload)?.browserCaptures;
    if (Array.isArray(capturedProfiles)) for (const input of capturedProfiles) {
      const parsed = brawlScopeCaptureSchema.safeParse(input);
      if (parsed.success && !browserCaptures.has(`${parsed.data.view}:${parsed.data.brawler}`) && !brawlScopeViewCache.get(parsed.data.view)?.brawlers.includes(parsed.data.brawler)) importBrawlScopeCapture(parsed.data);
    }

    let pairs = 0;
    for (const [view, profiles] of Object.entries(matrices)) {
      // Nunca sobrepor uma leitura desta sessão por uma gravada antes dela.
      brawlScopeMatchupMatrices.set(view, { ...profiles, ...brawlScopeMatchupMatrices.get(view) });
      pairs += Object.values(profiles).reduce((total, deltas) => total + Object.keys(deltas).length, 0);
    }
    if (pairs && !brawlScopeMatricesCapturedAt) brawlScopeMatricesCapturedAt = capturedAt;
    return { views: Object.keys(matrices).length, pairs };
  } catch {
    // Uma snapshot ilegível não pode impedir o servidor de arrancar.
    return { views: 0, pairs: 0 };
  }
}

export function getBrawlScopeMatchupCoverage() {
  return {
    capturedAt: brawlScopeMatricesCapturedAt ?? null,
    views: Object.fromEntries(
      Array.from(brawlScopeMatchupMatrices.entries()).map(([view, perfis]) => [view, {
        profiles: Object.keys(perfis).length,
        pairs: Object.values(perfis).reduce((total, deltas) => total + Object.keys(deltas).length, 0),
      }]),
    ),
  };
}

/**
 * Quem já foi colado, por vista.
 *
 * A contagem sozinha não chega para trabalhar: saber que há "12 fichas" não diz
 * quais faltam, e sem isso a pessoa que está a colar tem de se lembrar de cor
 * por onde ia — em 106 brawlers vezes sete vistas, é garantido repetir uns e
 * saltar outros. Com a lista, o site diz qual é o próximo.
 *
 * São só nomes: fica pequeno o suficiente para ir em cada resposta.
 */
export function getBrawlScopeColagemFeita(): Record<string, string[]> {
  return Object.fromEntries(
    Array.from(brawlScopeMatchupMatrices.entries()).map(([view, perfis]) => [view, Object.keys(perfis).sort()]),
  );
}

type SyncTrigger = "scheduled" | "manual" | "bootstrap";
type RelationDraft = Omit<SyncedCounterRelation, "pendingRemoval">;
type SynergyDraft = Omit<SyncedSynergyRelation, "pendingRemoval">;
export type CounterSyncSourceCollection = {
  source: CounterSyncSourceKey;
  state: CounterSyncSourceState;
  relations: RelationDraft[];
  /** Listas literais "Pair with"/"Best Teammates" lidas na mesma passagem. */
  synergies?: SynergyDraft[];
  activeBrawlers?: string[];
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;|&#x2212;|&minus;/g, "−")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function textContent(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeBrawler(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isExcludedDirection(attacker: string, defender: string) {
  return normalizeBrawler(attacker) === "glowy" && normalizeBrawler(defender) === "bolt";
}

function uniqueRelations(rows: RelationDraft[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.attacker || !row.defender || isExcludedDirection(row.attacker, row.defender)) return false;
    const key = `${row.source}:${normalizeBrawler(row.owner)}:${row.direction}:${row.modeId ?? "global"}:${counterRelationKey(row.attacker, row.defender)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Mantém a primeira leitura de cada par por fonte e modo, preservando a ordem
 * publicada. Um titular nunca é o seu próprio aliado.
 */
function uniqueSynergies<T extends SynergyDraft>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.owner || !row.teammate) return false;
    if (normalizeBrawler(row.owner) === normalizeBrawler(row.teammate)) return false;
    const key = `${row.source}:${synergyRelationContextKey(row.owner, row.teammate, row.modeId)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Estado de saúde por origem. Uma fonte pública pode responder 403 a um robô,
 * 429 quando o ritmo incomoda, ou 5xx quando está em apuros — e nesse caso o
 * correto é abrandar e desistir do ciclo, não martelar a origem.
 */
type SourceHealth = { blockedUntil: number; consecutiveFailures: number; lastStatus?: number; lastMessage?: string };
const sourceHealth = new Map<string, SourceHealth>();

const BLOQUEIO_BASE_MS = 10 * 60 * 1000;
/**
 * Teto do recuo.
 *
 * Era de 6 horas, pensado para uma origem sobrecarregada que precisa de descanso.
 * Mas uma recusa PERSISTENTE não é sobrecarga: é uma porta fechada, e esperar 6
 * horas não a abre — só garante que, quando ela reabrir, ninguém está a ver.
 * Uma hora chega para não incomodar ninguém e deixa a recolha voltar sozinha no
 * dia em que a fonte mudar de ideias.
 */
const BLOQUEIO_MAXIMO_MS = Number(process.env.BRAWLSCOPE_MAX_BACKOFF_MS ?? 60 * 60 * 1000);
/** Intervalo mínimo entre pedidos à mesma origem, para o ritmo não parecer um ataque. */
const PAUSA_ENTRE_PEDIDOS_MS = Number(process.env.BRAWLSCOPE_REQUEST_SPACING_MS ?? 120);
const ultimoPedido = new Map<string, number>();

function hostDe(url: string) {
  try { return new URL(url).host; } catch { return url; }
}

export function getSourceHealth() {
  return Object.fromEntries(Array.from(sourceHealth.entries()).map(([host, estado]) => [host, {
    blocked: estado.blockedUntil > Date.now(),
    blockedUntil: estado.blockedUntil ? new Date(estado.blockedUntil).toISOString() : null,
    consecutiveFailures: estado.consecutiveFailures,
    lastStatus: estado.lastStatus ?? null,
    lastMessage: estado.lastMessage ?? null,
  }]));
}

/** Erro que diz ao ciclo para parar já, em vez de tentar as fichas seguintes. */
class SourceBlockedError extends Error {
  constructor(readonly host: string, readonly status: number, readonly retryAfterMs: number, readonly detalhe?: string) {
    super(`${host} respondeu ${status}; recolha suspensa por ${Math.round(retryAfterMs / 60000)} min${detalhe ? ` — ${detalhe}` : ""}`);
    this.name = "SourceBlockedError";
  }
}

function registarBloqueio(host: string, status: number, retryAfterMs?: number) {
  const estado = sourceHealth.get(host) ?? { blockedUntil: 0, consecutiveFailures: 0 };
  estado.consecutiveFailures += 1;
  estado.lastStatus = status;
  const espera = retryAfterMs ?? Math.min(BLOQUEIO_MAXIMO_MS, BLOQUEIO_BASE_MS * 2 ** (estado.consecutiveFailures - 1));
  estado.blockedUntil = Date.now() + espera;
  estado.lastMessage = `HTTP ${status}`;
  sourceHealth.set(host, estado);
  return espera;
}

/**
 * Esquece o recuo acumulado de uma origem.
 *
 * Existe porque o recuo é cego: não sabe que a configuração mudou, que o
 * servidor foi reiniciado, ou que a fonte voltou. Sem forma de o limpar, uma
 * correção só podia ser confirmada esperando — o que torna qualquer tentativa
 * de resolver o problema insuportavelmente lenta.
 */
export function limparBloqueio(host?: string) {
  if (host) {
    sourceHealth.delete(host);
    return [host];
  }
  const hosts = Array.from(sourceHealth.keys());
  sourceHealth.clear();
  return hosts;
}

function registarSucesso(host: string) {
  const estado = sourceHealth.get(host);
  if (!estado) return;
  estado.consecutiveFailures = 0;
  estado.blockedUntil = 0;
  estado.lastStatus = 200;
  estado.lastMessage = undefined;
}

const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `ignoreBlock` existe para o diagnóstico manual.
 *
 * O recuo automático é cumulativo: ao fim de algumas recusas seguidas, a origem
 * fica bloqueada durante horas. Isso é o comportamento certo para a recolha —
 * mas tornava impossível confirmar uma correção: mudavam-se os cabeçalhos, e o
 * botão de teste continuava a responder "bloqueada" sem sequer tentar. Um
 * pedido único, pedido por uma pessoa, pode tentar; e se passar, limpa o
 * bloqueio para a recolha automática voltar de imediato.
 */
type PedidoComBrowser = (input: string, init?: Record<string, unknown>) => Promise<Response>;

let wreqFetch: PedidoComBrowser | null | undefined;
/** Por que o wreq-js não está a ser usado, quando é o caso. Vai parar ao estado público. */
let estadoWreq: string | null = null;

/**
 * Cliente com impressão digital TLS de browser.
 *
 * O Cloudflare do BrawlScope recusa o `fetch` nativo do Node ao nível do
 * handshake TLS (JA3/JA4) e do frame HTTP/2 SETTINGS — antes sequer de ler
 * os cabeçalhos. É por isso que o 403 persistiu mesmo com User-Agent e
 * `sec-ch-ua` corretos: a resposta traz `cf-ray`, a assinatura do desafio.
 *
 * `wreq-js` (Rust + BoringSSL) negocia a ligação byte a byte como o Chrome
 * real, o que é precisamente o que este tipo de proteção verifica. Se a
 * biblioteca não estiver instalada, cai de volta para o `fetch` normal, para
 * o site nunca ficar pior do que estava.
 */
export function getWreqStatus() {
  return {
    cliente: wreqFetch ? "wreq-js (TLS Chrome)" : wreqFetch === null ? "fetch nativo (wreq-js indisponível)" : "ainda não usado",
    detalhe: estadoWreq,
  };
}

async function fetchComTlsDeBrowser(): Promise<PedidoComBrowser> {
  if (wreqFetch !== undefined) return wreqFetch ?? (fetch as PedidoComBrowser);
  try {
    const wreq = await import("wreq-js");
    wreqFetch = wreq.fetch as unknown as PedidoComBrowser;
    estadoWreq = null;
  } catch (erro) {
    wreqFetch = null;
    estadoWreq = `o import falhou: ${erro instanceof Error ? erro.message : String(erro)}`;
  }
  return wreqFetch ?? (fetch as PedidoComBrowser);
}

export async function fetchText(url: string, tentativa = 0, options?: { ignoreBlock?: boolean }): Promise<string> {
  const host = hostDe(url);
  const estado = sourceHealth.get(host);
  if (!options?.ignoreBlock && estado && estado.blockedUntil > Date.now()) {
    throw new SourceBlockedError(host, estado.lastStatus ?? 0, estado.blockedUntil - Date.now());
  }

  // Espaçamento entre pedidos à mesma origem, com jitter aleatório.
  // O ritmo fixo (sempre exatamente o mesmo intervalo) é por si só um padrão
  // de bot; um navegador real nunca repete o mesmo intervalo.
  const anterior = ultimoPedido.get(host) ?? 0;
  const jitter = Math.floor(Math.random() * PAUSA_ENTRE_PEDIDOS_MS);
  const espera = anterior + PAUSA_ENTRE_PEDIDOS_MS + jitter - Date.now();
  if (espera > 0) await dormir(espera);
  ultimoPedido.set(host, Date.now());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = {
        /**
         * Cabeçalhos de um pedido normal de página.
         *
         * O User-Agent anterior anunciava-se como leitor automático, e o
         * BrawlScope passou a responder 403 a esses pedidos — as mesmas páginas
         * abrem sem problema num navegador. Os cabeçalhos que faltavam eram os
         * que qualquer browser envia; sem eles o pedido nem chega ao conteúdo.
         *
         * A identificação do projeto continua presente, agora em `From`, e o
         * ritmo continua o mesmo: um pedido de cada vez, espaçado. Se a fonte
         * quiser mesmo recusar, `BRAWLSCOPE_USER_AGENT` permite mudar isto sem
         * tocar no código, e o 403 continua a levar a recolha a recuar em vez
         * de insistir.
         *
         * Os client hints (`sec-ch-ua*`) e o `Referer` foram acrescentados
         * porque o Cloudflare os verifica: o Chrome 128 envia-os sempre, e a
         * sua ausência é por si só um sinal de bot — mesmo que o TLS seja o do
         * wreq-js, os cabeçalhos têm de ser coerentes com o perfil anunciado.
         */
        "User-Agent": process.env.BRAWLSCOPE_USER_AGENT
          ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "sec-ch-ua": process.env.BRAWLSCOPE_SEC_CH_UA
          ?? '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": process.env.BRAWLSCOPE_REFERER ?? "https://brawlscope.com/counters",
        /**
         * `Accept-Encoding` NÃO é enviado de propósito.
         *
         * O fetch do Node negocia e descomprime a resposta sozinho. Declarar o
         * cabeçalho à mão faz com que ele deixe de o fazer: a resposta chega
         * comprimida, `response.text()` devolve bytes ilegíveis, e o parser não
         * reconhece nada — uma falha que se parece exatamente com "a fonte
         * mudou a marcação".
         */
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "no-cache",
        ...(process.env.BRAWL_CONTACT_EMAIL ? { From: process.env.BRAWL_CONTACT_EMAIL } : {}),
    };
    /**
     * O pedido propriamente dito.
     *
     * Com wreq-js, usa-se o fingerprint TLS/HTTP2 de Chrome no Windows — tem
     * de bater certo com o User-Agent e o sec-ch-ua-platform declarados acima.
     * Se o pedido pelo wreq-js lançar exceção (binding nativo em falta, perfil
     * desconhecido), regista-se o motivo em `estadoWreq` e cai-se para o fetch
     * nativo: continua a poder dar 403, mas o estado público diz qual dos dois
     * clientes foi.
     */
    let response: Response;
    if (wreqFetch) {
      try {
        response = await wreqFetch(url, { browser: "chrome", os: "windows", headers });
      } catch (erro) {
        estadoWreq = `erro no pedido: ${erro instanceof Error ? erro.message : String(erro)}`;
        response = await fetch(url, { signal: controller.signal, headers });
      }
    } else {
      response = await fetch(url, { signal: controller.signal, headers });
    }

    /**
     * Um pedido de diagnóstico não agrava o recuo.
     *
     * Isto era um erro meu com consequência direta: o botão "Testar fontes
     * agora" ignora o bloqueio para poder tentar, mas cada tentativa falhada
     * contava como mais uma falha consecutiva e DUPLICAVA a espera. Testar três
     * vezes levava a espera de 10 minutos para 80, depois 160. Quem estava a
     * tentar perceber o problema estava a piorá-lo, sem nenhuma forma de o
     * saber. Diagnosticar tem de ser gratuito.
     */
    const registar = options?.ignoreBlock ? () => 0 : registarBloqueio;

    if (response.status === 429 || response.status === 503) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const esperaMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined;
      throw new SourceBlockedError(host, response.status, registar(host, response.status, esperaMs));
    }
    if (response.status === 401 || response.status === 403) {
      /**
       * Distinguir "403 de cabeçalhos" de "desafio Cloudflare".
       *
       * Quando o Cloudflare interceta o pedido com um desafio (JS/TLS), a
       * resposta traz `cf-mitigated: challenge` e um cabeçalho `cf-ray`. Nesse
       * caso mudar cabeçalhos não chega — e sabe-se de fora qual cliente foi
       * usado (nativo ou wreq-js), o que aponta diretamente o próximo passo:
       * instalar o wreq-js, usar proxy, ou pedir à fonte para libertar o IP.
       */
      const cfMitigated = response.headers.get("cf-mitigated");
      const cfRay = response.headers.get("cf-ray");
      const esperaMs = registar(host, response.status);
      if (response.status === 403 && (cfMitigated || cfRay)) {
        throw new SourceBlockedError(
          host,
          response.status,
          esperaMs,
          `desafio Cloudflare (cf-ray: ${cfRay ?? "n/d"}); cliente usado: ${wreqFetch ? "wreq-js" : "fetch nativo"}${estadoWreq ? ` — ${estadoWreq}` : ""}. Se foi o fetch nativo, o wreq-js não está carregado; se foi o wreq-js, falta reputação de IP (proxy) ou a fonte tem de libertar o IP.`,
        );
      }
      throw new SourceBlockedError(host, response.status, esperaMs);
    }
    if (response.status >= 500) {
      // Falha passageira: uma repetição com espera curta antes de desistir da ficha.
      if (tentativa < 2) {
        await dormir(500 * (tentativa + 1));
        return fetchText(url, tentativa + 1, options);
      }
      throw new Error(`${response.status} ${response.statusText}`);
    }
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    registarSucesso(host);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]).then(
        value => ({ status: "fulfilled", value }) as PromiseFulfilledResult<R>,
        reason => ({ status: "rejected", reason }) as PromiseRejectedResult,
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

export function buildStaticBrawlScopeCollection(now: string): CounterSyncSourceCollection {
  const relations: RelationDraft[] = [];
  const synergies: SynergyDraft[] = [];
  const brawlers: string[] = [];

  for (const entry of Object.values(brawlScopeSynergyData)) {
    const teammates = normalizeBrawlScopeSynergyList(entry.teammates, entry.brawler);
    teammates.forEach((teammate, index) => {
      synergies.push({
        owner: entry.brawler,
        teammate: teammate.brawler,
        delta: teammate.delta,
        rank: index + 1,
        source: "brawlscope",
        sourceUrl: entry.sourceUrl,
      });
    });
  }

  for (const entry of Object.values(brawlScopeCounterData)) {
    const owner = entry.sourceUrl.match(/[?&]brawler=([^&]+)/i)?.[1] ?? "";
    const brawler = decodeURIComponent(owner).replace(/-/g, " ") || owner;
    // O nome real vem da chave do catálogo. A procura abaixo conserva números e hífens.
    const record = Object.entries(brawlScopeCounterData).find(([, value]) => value === entry);
    const name = record?.[0] ?? brawler;
    brawlers.push(name);
    // O catálogo já guarda os dois sentidos na orientação publicada pela fonte.
    const targets = entry.targets;
    const counteredBy = entry.counteredBy;

    for (const defender of targets) {
      relations.push({ owner: name, direction: "targets", attacker: name, defender, source: "brawlscope", sourceUrl: entry.sourceUrl });
    }
    for (const attacker of counteredBy) {
      relations.push({ owner: name, direction: "counteredBy", attacker, defender: name, source: "brawlscope", sourceUrl: entry.sourceUrl });
    }
  }

  return {
    source: "brawlscope",
    state: {
      status: "static",
      complete: false,
      fetchedAt: now,
      brawlers: Array.from(new Set(brawlers)),
      relationCount: uniqueRelations(relations).length,
      note: "Catálogo literal prioritário preservado; a página pública ainda não expõe uma extração estruturada segura para remoções.",
    },
    relations: uniqueRelations(relations),
    synergies: uniqueSynergies(synergies),
  };
}

function sectionAfterLabel(pageHtml: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marker = new RegExp(`<p[^>]*>\\s*${escaped}\\s*<\\/p>`, "i").exec(pageHtml);
  if (!marker || marker.index === undefined) return "";
  const after = pageHtml.slice(marker.index + marker[0].length);
  const end = after.search(/<\/ul>/i);
  return end >= 0 ? after.slice(0, end) : after;
}

/**
 * Percentagem publicada no cartão. Exige um sinal explícito para nunca confundir
 * o número de um nome (8-Bit, R-T) com um valor de matchup.
 */
function publishedPercent(value: string) {
  const match = value.match(/([+\u2212-])\s*(\d+(?:[.,]\d+)?)\s*%?/);
  if (!match) return undefined;
  const amount = Number(match[2].replace(",", "."));
  if (!Number.isFinite(amount)) return undefined;
  return match[1] === "+" ? amount : -amount;
}

function stripPublishedPercent(value: string) {
  return value.replace(/\s*[+\u2212-]\s*\d+(?:[.,]\d+)?\s*%?\s*$/, "").trim();
}

/** Cartões de uma secção do perfil BrawlScope, com o nome e a percentagem publicada. */
function brawlScopeEntries(section: string) {
  return Array.from(section.matchAll(/<a[^>]*href=["']\/counters\/([^"'?]+)(?:\?[^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi))
    .map((match) => {
      const inner = match[2];
      const text = textContent(inner);
      const named = textContent(/<span[^>]*>([\s\S]*?)<\/span>/i.exec(inner)?.[1] ?? "");
      const brawler = stripPublishedPercent(named || text) || decodeURIComponent(match[1]).replace(/-/g, " ");
      return { brawler, delta: publishedPercent(text) };
    })
    .filter((entry) => Boolean(entry.brawler));
}

/**
 * Tabela "Every matchup" da ficha: uma linha por adversário, no formato
 * «NOME  A% vs B% usual · N battles  +D». Cada linha traz o seu próprio controlo:
 * A − D tem de dar B. Linhas que não fechem são descartadas em vez de entrarem
 * com um valor duvidoso.
 */
export function parseBrawlScopeEveryMatchup(pageHtml: string, knownNames: Iterable<string>) {
  const conhecidos = new Map(Array.from(knownNames).map((nome) => [normalizeBrawler(nome), nome]));
  const deltas: Record<string, number> = {};
  let descartadas = 0;
  const normalizado = pageHtml.replaceAll('\\"', '"');

  for (const match of normalizado.matchAll(/<a[^>]*href=["']\/counters\/([^"'?]+)(?:\?[^"']*)?["'][^>]*>([\s\S]{0,400}?)<\/a>/gi)) {
    const texto = textContent(match[2]);
    const numeros = texto.match(/(\d+(?:[.,]\d+)?)\s*%\s*vs\s*(\d+(?:[.,]\d+)?)\s*%[\s\S]*?([+\u2212-]\s*\d+(?:[.,]\d+)?)/);
    if (!numeros) continue;
    const nomeBruto = texto.replace(/\d[\s\S]*$/, "").trim() || decodeURIComponent(match[1]).replace(/-/g, " ");
    const nome = conhecidos.get(normalizeBrawler(nomeBruto));
    if (!nome) { descartadas += 1; continue; }
    const taxa = Number(numeros[1].replace(",", "."));
    const media = Number(numeros[2].replace(",", "."));
    const delta = Number(numeros[3].replace("\u2212", "-").replace(/\s+/g, "").replace(",", "."));
    if (![taxa, media, delta].every(Number.isFinite) || Math.abs(taxa - media - delta) > 0.15) { descartadas += 1; continue; }
    if (!(nome in deltas)) deltas[nome] = delta;
  }

  return { deltas, descartadas };
}

function brawlScopeList(section: string) {
  return brawlScopeEntries(section).map((entry) => entry.brawler);
}

function brawlScopeProfileName(pageHtml: string) {
  const match = pageHtml.match(/<h1[^>]*>\s*([^<]+?)\s+counters\s*<\/h1>/i);
  return match ? textContent(match[1]) : undefined;
}

export function parseBrawlScopeModePage(pageHtml: string, mode: typeof brawlScopeModes[number] | null, sourceUrl: string, knownNames?: Iterable<string>) {
  const brawler = brawlScopeProfileName(pageHtml);
  if (!brawler) return undefined;
  return {
    brawler,
    counteredBy: brawlScopeList(sectionAfterLabel(pageHtml, "Counter with")),
    targets: brawlScopeList(sectionAfterLabel(pageHtml, "Punishes")),
    /** Percentagens publicadas nos dois sentidos, na perspetiva da fonte. */
    counterDeltas: [
      ...brawlScopeEntries(sectionAfterLabel(pageHtml, "Counter with")),
      ...brawlScopeEntries(sectionAfterLabel(pageHtml, "Punishes")),
    ],
    // Terceira lista publicada no mesmo perfil: os melhores aliados do titular,
    // com a percentagem de sinergia de cada cartão. Fica limitada ao Top 10
    // exposto e nunca é completada por inferência.
    synergies: normalizeBrawlScopeSynergyList(brawlScopeEntries(sectionAfterLabel(pageHtml, "Pair with")), brawler),
    /** Tabela completa da mesma página, sem pedidos adicionais. */
    everyMatchup: parseBrawlScopeEveryMatchup(pageHtml, knownNames ?? []),
    // Sem modo: é a vista Overall, que o adaptador guarda como leitura global.
    modeId: mode?.id,
    mode: mode?.label,
    sourceUrl,
  };
}

// A resolução de endereços vive em `shared/brawlScopeSlugs.ts`: o índice
// deixou de publicar os links e a lista passou a poder vir do roster conhecido.

/**
 * `force` é o que dá sentido ao botão "Atualizar agora": um pedido manual renova
 * as sete vistas, sem respeitar o intervalo nem o teto por ciclo. Os ciclos
 * automáticos continuam a ir devagar, uma vista de cada vez.
 */
async function collectBrawlScopeModes(now: string, options?: { force?: boolean }): Promise<CounterSyncSourceCollection> {
  const configuredInterval = Number(process.env.BRAWLSCOPE_MODE_SYNC_INTERVAL_MS ?? DEFAULT_BRAWLSCOPE_MODE_INTERVAL_MS);
  const intervalMs = Number.isFinite(configuredInterval) ? Math.max(10 * 60 * 1000, configuredInterval) : DEFAULT_BRAWLSCOPE_MODE_INTERVAL_MS;
  const porCiclo = Math.max(1, Number(process.env.BRAWLSCOPE_VIEWS_PER_CYCLE ?? DEFAULT_VIEWS_PER_CYCLE) || DEFAULT_VIEWS_PER_CYCLE);

  const errors: string[] = [];
  const completedModes: string[] = [];
  /** Vistas cujos endereços vieram do roster porque o índice não os publicou. */
  const slugOrigins = new Set<string>();
  /**
   * Brawlers já vistos em leituras anteriores. Serve para um brawler novo — que
   * o catálogo do repositório ainda não conhece — continuar a ser lido depois de
   * a deteção automática de roster o ter descoberto.
   */
  const rosterConhecido = Array.from(new Set(Array.from(brawlScopeViewCache.values()).flatMap((vista) => vista.brawlers)));

  // A vista Overall (sem filtro de modo) entra primeiro: é a leitura canónica do
  // projeto, Overall + Lendário+, a mesma que a fonte serve na ficha sem filtros.
  // Depois vêm as seis vistas por modo, na mesma patente.
  const todasAsVistas: Array<typeof brawlScopeModes[number] | null> = [null, ...brawlScopeModes];

  // Se a origem nos fechou a porta, nem sequer tentamos: devolvemos o que já
  // temos em cache e dizemos porquê.
  const host = hostDe(brawlScopeIndexUrl());
  const saude = sourceHealth.get(host);
  const bloqueada = Boolean(saude && saude.blockedUntil > Date.now());

  const vistasAtrasadas = options?.force
    ? todasAsVistas
    : todasAsVistas
        .filter((mode) => {
          const cache = brawlScopeViewCache.get(mode?.id ?? "overall");
          return !cache || Date.now() - cache.completedAt >= intervalMs;
        })
        .slice(0, porCiclo);

  const views = bloqueada ? [] : vistasAtrasadas;
  if (bloqueada) {
    errors.push(`${host} bloqueou a recolha (HTTP ${saude?.lastStatus ?? "?"}); nova tentativa depois de ${new Date(saude?.blockedUntil ?? Date.now()).toLocaleTimeString("pt-PT")}`);
  }

  let vistasFeitas = 0;
  for (const mode of views) {
    const viewId = mode?.id ?? "overall";
    vistasFeitas += 1;
    reportSyncJobProgress(COUNTER_SYNC_JOB, `BrawlScope · vista ${vistasFeitas}/${views.length} (${viewId})`);
    try {
      /**
       * O índice é tentado, mas já não é obrigatório. Falhar a leitura do
       * índice deixou de poder cancelar a vista: as fichas continuam servidas
       * pelo servidor da fonte, e é delas que vêm os dados. Um índice vazio
       * passa a ser uma nota, não uma paragem.
       */
      let indexHtml = "";
      try {
        indexHtml = await fetchText(brawlScopeIndexUrl({ modeId: mode?.id, rankId: DEFAULT_BRAWLSCOPE_RANK }));
      } catch (indexError) {
        if (indexError instanceof SourceBlockedError) throw indexError;
      }
      const resolucao = resolveBrawlScopeSlugs(indexHtml, { modeId: mode?.id, extraNames: rosterConhecido });
      const slugs = resolucao.slugs;
      if (resolucao.origin === "roster") slugOrigins.add(viewId);
      if (slugs.length < MIN_BRAWLSCOPE_SLUGS) throw new Error(`${viewId}: sem endereços suficientes (${slugs.length} brawlers)`);
      // Os nomes editoriais do catálogo servem para validar cada linha da tabela.
      const nomesConhecidos = Object.values(brawlScopeCounterData).length
        ? Array.from(new Set(Object.values(brawlScopeCounterData).flatMap((entry) => [...entry.counteredBy, ...entry.targets])))
        : [];
      const settled = await mapWithConcurrency(slugs, 2, async (slug) => {
        const sourceUrl = brawlScopeProfileUrl(slug, { modeId: mode?.id, rankId: DEFAULT_BRAWLSCOPE_RANK });
        const html = await fetchText(sourceUrl);
        const parsed = parseBrawlScopeModePage(html, mode, sourceUrl, nomesConhecidos);
        if (!parsed) throw new Error(`Nome ausente em ${sourceUrl}`);
        return parsed;
      });
      const fetched = settled
        .filter((item): item is PromiseFulfilledResult<NonNullable<ReturnType<typeof parseBrawlScopeModePage>>> => item.status === "fulfilled" && Boolean(item.value))
        .map((item) => item.value);
      if (fetched.length < 80) throw new Error(`${viewId}: apenas ${fetched.length}/${slugs.length} páginas válidas`);
      completedModes.push(viewId);
      const matriz: Record<string, Record<string, number>> = {};
      const dynamicRelations: RelationDraft[] = [];
      const dynamicSynergies: SynergyDraft[] = [];
      const fetchedBrawlers = new Set<string>();
      for (const profile of fetched) {
        fetchedBrawlers.add(profile.brawler);
        if (Object.keys(profile.everyMatchup.deltas).length) matriz[profile.brawler] = profile.everyMatchup.deltas;
        const publishedDelta = (name: string) => profile.counterDeltas.find((entry) => normalizeBrawler(entry.brawler) === normalizeBrawler(name))?.delta;
        const context = { source: "brawlscope" as const, sourceUrl: profile.sourceUrl, modeId: profile.modeId, mode: profile.mode, rankId: DEFAULT_BRAWLSCOPE_RANK };
        for (const defender of profile.targets) dynamicRelations.push({ owner: profile.brawler, direction: "targets", attacker: profile.brawler, defender, delta: publishedDelta(defender), ...context });
        for (const attacker of profile.counteredBy) dynamicRelations.push({ owner: profile.brawler, direction: "counteredBy", attacker, defender: profile.brawler, delta: publishedDelta(attacker), ...context });
        profile.synergies.forEach((teammate, index) => {
          dynamicSynergies.push({ owner: profile.brawler, teammate: teammate.brawler, delta: teammate.delta, rank: index + 1, ...context });
        });
      }
      if (Object.keys(matriz).length) {
        brawlScopeMatchupMatrices.set(viewId, matriz);
        brawlScopeMatricesCapturedAt = now;
      }
      brawlScopeViewCache.set(viewId, {
        completedAt: Date.now(),
        relations: dynamicRelations,
        synergies: dynamicSynergies,
        brawlers: Array.from(fetchedBrawlers),
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${viewId}: falha desconhecida`);
      // Porta fechada: parar já em vez de insistir nas vistas seguintes.
      if (error instanceof SourceBlockedError) break;
    }
  }

  // O resultado junta tudo o que está em cache, renovado neste ciclo ou não.
  const emCache = Array.from(brawlScopeViewCache.values());
  const allRelations = uniqueRelations(emCache.flatMap((vista) => vista.relations));
  const allSynergies = uniqueSynergies(emCache.flatMap((vista) => vista.synergies));
  const fetchedBrawlers = new Set(emCache.flatMap((vista) => vista.brawlers));
  const expectedViews = brawlScopeModes.length + 1; // seis modos + Overall
  const vistasEmCache = brawlScopeViewCache.size;
  const status: CounterSyncSourceStatus = vistasEmCache === expectedViews ? "success" : vistasEmCache > 0 ? "partial" : "failed";
  const synergyProfiles = new Set(allSynergies.map((entry) => normalizeBrawler(entry.owner))).size;
  const collection: CounterSyncSourceCollection = {
    source: "brawlscope",
    state: {
      status,
      complete: vistasEmCache === expectedViews,
      fetchedAt: now,
      brawlers: Array.from(fetchedBrawlers),
      modes: completedModes,
      relationCount: allRelations.length,
      note: errors.length
        ? errors.slice(0, 3).join(" | ")
        : `${vistasEmCache}/${expectedViews} vistas em Lendário+ (renovadas ${options?.force ? "por pedido manual" : "neste ciclo"}: ${completedModes.join(", ") || "nenhuma, todas dentro do intervalo"}). Sinergia "Pair with" em ${synergyProfiles} perfis.${slugOrigins.size ? ` Endereços das fichas vieram do roster conhecido (o índice da fonte já não publica os links) em: ${Array.from(slugOrigins).join(", ")}.` : ""}`,
    },
    relations: allRelations,
    synergies: allSynergies,
    activeBrawlers: Array.from(fetchedBrawlers),
  };
  return collection;
}

/**
 * Importação manual de uma ficha do BrawlScope, colada por uma pessoa.
 *
 * POR QUE ISTO EXISTE
 *
 * O BrawlScope responde 403 a este servidor. Tentou-se com cabeçalhos de
 * navegador, tentou-se contactar quem o mantém, e ficou sem resposta. A recolha
 * automática desta fonte acabou — e não vai ser contornada: uma porta fechada
 * sem resposta não é um convite a entrar por trás.
 *
 * Mas as páginas continuam públicas e abrem no navegador de qualquer pessoa. É
 * para isso que existem. Quando o dono do site abre uma ficha, copia o código da
 * página e o cola aqui, não há recolha automática nenhuma a acontecer: há uma
 * pessoa a ler uma página pública e a trazer o que leu.
 *
 * Uma ficha traz a tabela "Every matchup" completa — 105 confrontos daquele
 * brawler — no modo que estiver selecionado no endereço. Vinte colagens cobrem
 * quase todas as decisões de um draft.
 */
export type BrawlScopeImportResult = {
  ok: boolean;
  brawler?: string;
  view?: string;
  viewLabel?: string;
  pairs?: number;
  relations?: number;
  synergies?: number;
  /** Adversários lidos que o catálogo do projeto ainda não conhece. */
  unknownNames?: string[];
  /** Linhas que caíram num adversário já lido — ver `PastedProfile.duplicated`. */
  duplicated?: string[];
  error?: string;
};

/**
 * De que modo é a página colada.
 *
 * O endereço canónico é a única marca fiável: a página tem ligações para todos
 * os outros modos no seletor, por isso procurar `mode=` em qualquer sítio daria
 * o modo errado quase sempre.
 */
function detectarVistaColada(html: string): string {
  const canonico = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (!canonico) return "overall";
  const modo = canonico.match(/[?&]mode=([a-zA-Z]+)/)?.[1];
  if (!modo) return "overall";
  return brawlScopeModes.some((vista) => vista.id === modo) ? modo : "overall";
}

/**
 * Quantos confrontos bastam para guardar uma ficha colada.
 *
 * Esteve em 40 e isso rejeitava páginas boas. A vista "Overall" traz as 105
 * linhas, mas uma vista de modo só lista os confrontos com jogos que cheguem —
 * num modo pouco jogado são trinta e poucas, às vezes menos. Quem colava uma
 * dessas via "só li 36 confrontos" e concluía, com razão, que não funcionava.
 *
 * O que protege contra lixo não é o número: é o nome do brawler ter de existir
 * mesmo no roster e cada linha ter de trazer taxa e média. Oito linhas já são
 * sinal claro de tabela verdadeira.
 */
const MIN_CONFRONTOS_COLADOS = 8;

const browserCaptures = new Map<string, BrawlScopeCapture>();

export function importBrawlScopeCapture(input: BrawlScopeCapture): BrawlScopeImportResult {
  const profile = brawlScopeCaptureSchema.parse(input);
  const mode = brawlScopeModes.find(m => m.id === profile.view) ?? null;
  const result = guardarFichaColada(profile.brawler, profile.view, mode,
    Object.fromEntries(profile.rows.map(row => [row.opponent, row.delta])), {
      targets: profile.targets.map(row => row.brawler),
      counteredBy: profile.counteredBy.map(row => row.brawler),
      counterDeltas: [...profile.counteredBy, ...profile.targets],
      synergies: profile.synergies,
    });
  browserCaptures.set(`${profile.view}:${profile.brawler}`, profile);
  return result;
}

export function importBrawlScopePage(
  conteudo: string,
  opcoes?: { view?: string; url?: string },
): BrawlScopeImportResult {
  if (typeof conteudo !== "string" || conteudo.trim().length < 400) {
    return { ok: false, error: "O texto colado é curto de mais. Com a ficha aberta no navegador, carrega Ctrl+A e depois Ctrl+C, e cola aqui." };
  }

  const doEndereco = opcoes?.url ? readBrawlScopeUrl(opcoes.url) : {};
  const viewId = opcoes?.view && (opcoes.view === "overall" || brawlScopeModes.some((vista) => vista.id === opcoes.view))
    ? opcoes.view
    : doEndereco.mode && brawlScopeModes.some((vista) => vista.id === doEndereco.mode)
      ? doEndereco.mode
      : detectarVistaColada(conteudo);
  const mode = viewId === "overall" ? null : brawlScopeModes.find((vista) => vista.id === viewId) ?? null;

  const nomesConhecidos = Array.from(new Set(
    Object.values(brawlScopeCounterData).flatMap((entrada) => [...entrada.counteredBy, ...entrada.targets]),
  ));

  /**
   * Duas formas de colar, porque a primeira falhou na prática.
   *
   * O código-fonte (Ctrl+U) não traz a tabela "Every matchup": o BrawlScope
   * monta-a no navegador. Quem colava o código-fonte via o nome reconhecido e
   * zero confrontos — o pior tipo de erro, porque parece que funcionou a meio.
   *
   * A página como se vê (Ctrl+A, Ctrl+C) traz tudo já montado. É essa a forma
   * recomendada, e a marcação continua a ser aceite para quem a prefira.
   */
  if (looksLikeHtml(conteudo)) {
    const sourceUrl = brawlScopeProfileUrl(doEndereco.slug ?? "colada", { modeId: mode?.id, rankId: DEFAULT_BRAWLSCOPE_RANK });
    const perfil = parseBrawlScopeModePage(conteudo, mode, sourceUrl, nomesConhecidos);
    if (perfil && Object.keys(perfil.everyMatchup?.deltas ?? {}).length >= MIN_CONFRONTOS_COLADOS) {
      return guardarFichaColada(perfil.brawler, viewId, mode, perfil.everyMatchup.deltas, {
        targets: perfil.targets,
        counteredBy: perfil.counteredBy,
        counterDeltas: perfil.counterDeltas,
        synergies: perfil.synergies,
      });
    }
    // Marcação sem tabela é exatamente o caso do código-fonte: cai no modo texto,
    // que às vezes ainda encontra os números soltos entre as etiquetas.
  }

  const texto = looksLikeHtml(conteudo)
    ? conteudo.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ")
    : conteudo;

  const lido = parsePastedMatchups(texto, nomesConhecidos);
  const nomeDoEndereco = doEndereco.slug
    ? nomesConhecidos.find((nome) => brawlScopeSlugFromName(nome) === doEndereco.slug)
    : undefined;
  const brawler = nomeDoEndereco ?? lido.brawler;

  if (!brawler) {
    return { ok: false, error: "Não percebi de que brawler é esta ficha. Cola também o endereço da página (a barra do navegador) no campo de cima — é a forma mais segura." };
  }
  if (lido.matchups.length < MIN_CONFRONTOS_COLADOS) {
    /**
     * Duas falhas diferentes, e dizer-lhes o mesmo era metade do problema.
     *
     * Zero confrontos quer dizer que a tabela não veio no texto — quase sempre
     * o código-fonte (Ctrl+U), onde ela não existe. Aí o conselho do Ctrl+A
     * está certo.
     *
     * Mas com dez ou vinte linhas lidas a tabela VEIO: o texto está bom e é a
     * leitura que está a perder linhas. Mandar a pessoa copiar outra vez é
     * mandá-la repetir uma coisa que já fez bem.
     */
    const veioTabela = lido.matchups.length > 0 || lido.discarded > 0;
    return {
      ok: false,
      brawler,
      error: veioTabela
        ? `Reconheci ${brawler} e li ${lido.matchups.length} confrontos — poucos de mais para guardar (mínimo ${MIN_CONFRONTOS_COLADOS}). A tabela veio no texto, por isso copiaste bem; o problema é da leitura. Confirma que copiaste a página toda (Ctrl+A antes do Ctrl+C) e que a tabela "Every matchup" já estava aberta.`
        : `Reconheci ${brawler}, mas não li nenhum confronto. Se copiaste o código-fonte (Ctrl+U), essa não é a forma certa: a tabela é montada no navegador e não existe lá. Abre a ficha, carrega Ctrl+A e Ctrl+C na própria página, e cola isso.`,
    };
  }

  const deltas: Record<string, number> = {};
  for (const confronto of lido.matchups) deltas[confronto.opponent] = confronto.delta;
  return { ...guardarFichaColada(brawler, viewId, mode, deltas), unknownNames: lido.unknownNames, duplicated: lido.duplicated };
}

/**
 * Guarda uma ficha colada na matriz e nas listas da vista.
 *
 * Separado da leitura porque as duas formas de colar — marcação e texto —
 * terminam exatamente no mesmo sítio, e essa parte não pode divergir.
 */
function guardarFichaColada(
  brawler: string,
  viewId: string,
  mode: typeof brawlScopeModes[number] | null,
  deltas: Record<string, number>,
  listas?: {
    targets: string[];
    counteredBy: string[];
    counterDeltas: Array<{ brawler: string; delta?: number }>;
    synergies: Array<{ brawler: string; delta?: number }>;
  },
): BrawlScopeImportResult {
  const matriz = brawlScopeMatchupMatrices.get(viewId) ?? {};
  browserCaptures.delete(`${viewId}:${brawler}`);
  matriz[brawler] = deltas;
  brawlScopeMatchupMatrices.set(viewId, matriz);
  brawlScopeMatricesCapturedAt = new Date().toISOString();

  const sourceUrl = brawlScopeProfileUrl(brawlScopeSlugFromName(brawler), { modeId: mode?.id, rankId: DEFAULT_BRAWLSCOPE_RANK });
  const contexto = { source: "brawlscope" as const, sourceUrl, modeId: mode?.id, mode: mode?.label, rankId: DEFAULT_BRAWLSCOPE_RANK };
  const publishedDelta = (nome: string) => listas?.counterDeltas.find((entrada) => normalizeBrawler(entrada.brawler) === normalizeBrawler(nome))?.delta;

  /**
   * Sem as listas literais, elas são derivadas da própria tabela: os dez
   * confrontos mais desfavoráveis são quem o countera, os dez mais favoráveis
   * são quem ele castiga. É a mesma leitura que a página publica no topo, feita
   * a partir dos mesmos números.
   */
  const ordenados = Object.entries(deltas).sort(([, esquerda], [, direita]) => direita - esquerda);
  const counteredBy = listas?.counteredBy ?? ordenados.slice(0, 10).filter(([, valor]) => valor > 0).map(([nome]) => nome);
  const targets = listas?.targets ?? ordenados.slice(-10).filter(([, valor]) => valor < 0).map(([nome]) => nome).reverse();

  const novasRelacoes: RelationDraft[] = [
    ...targets.map((defender) => ({ owner: brawler, direction: "targets" as const, attacker: brawler, defender, delta: publishedDelta(defender), ...contexto })),
    ...counteredBy.map((attacker) => ({ owner: brawler, direction: "counteredBy" as const, attacker, defender: brawler, delta: publishedDelta(attacker), ...contexto })),
  ];
  const novasSinergias: SynergyDraft[] = (listas?.synergies ?? []).map((aliado, indice) => ({
    owner: brawler, teammate: aliado.brawler, delta: aliado.delta, rank: indice + 1, ...contexto,
  }));

  const cache = brawlScopeViewCache.get(viewId) ?? { completedAt: 0, relations: [], synergies: [], brawlers: [] };
  const doMesmoBrawler = (dono: string) => normalizeBrawler(dono) === normalizeBrawler(brawler);
  brawlScopeViewCache.set(viewId, {
    completedAt: Date.now(),
    relations: [...cache.relations.filter((relacao) => !doMesmoBrawler(relacao.owner)), ...novasRelacoes],
    synergies: listas
      ? [...cache.synergies.filter((sinergia) => !doMesmoBrawler(sinergia.owner)), ...novasSinergias]
      : cache.synergies,
    brawlers: Array.from(new Set([...cache.brawlers, brawler])),
  });

  return {
    ok: true,
    brawler,
    view: viewId,
    viewLabel: mode?.label ?? "Geral",
    pairs: Object.keys(deltas).length,
    relations: novasRelacoes.length,
    synergies: novasSinergias.length,
  };
}

/**
 * Apaga fichas coladas — de uma vista, ou de todas.
 *
 * Colar a ficha errada, ou no modo errado, tem de ter volta. Sem isto, um
 * engano ficava lá até alguém reiniciar o servidor com sorte.
 */
export function clearImportedBrawlScope(viewId?: string) {
  const vistas = viewId ? [viewId] : Array.from(brawlScopeMatchupMatrices.keys());
  let fichas = 0;
  for (const vista of vistas) {
    for (const [key, capture] of Array.from(browserCaptures)) if (capture.view === vista) browserCaptures.delete(key);
    fichas += Object.keys(brawlScopeMatchupMatrices.get(vista) ?? {}).length;
    brawlScopeMatchupMatrices.delete(vista);
    brawlScopeViewCache.delete(vista);
  }
  return { views: vistas, profiles: fichas };
}

/**
 * Grava já as matrizes na snapshot, sem esperar pelo ciclo.
 *
 * Sem isto, uma ficha colada só ficava guardada no ciclo seguinte — e um
 * reinício pelo meio perdia o trabalho de quem a colou. Perder uma colagem
 * manual é muito pior do que perder uma recolha automática, que se repete
 * sozinha.
 */
export async function persistMatchupMatricesNow() {
  const guardada = await getCounterSyncSnapshot();
  const payload = parseSnapshotPayload(guardada?.payload);
  if (!guardada || !payload) return { saved: false as const, reason: "ainda não existe snapshot para atualizar" };

  const saved = await saveCounterSnapshotWithCurrentMatrices({
    id: 1,
    version: guardada.version,
    capturedAt: guardada.capturedAt,
    relationCount: guardada.relationCount,
    brawlScopeStatus: guardada.brawlScopeStatus,
    calculatorStatus: guardada.calculatorStatus,
    planetStatus: guardada.planetStatus,
    sourceNotes: guardada.sourceNotes,
    payload: JSON.stringify({
      ...payload,
      browserCaptures: Array.from(browserCaptures.values()),
      matchupMatrices: encodeMatchupMatrices(getBrawlScopeMatchupMatrices(), brawlScopeMatricesCapturedAt),
    }),
  });
  return { saved: Boolean(saved?.payload) };
}

// Serialize snapshot writes in this server process. An hourly sync must not
// overwrite captures that arrived while its network requests were running.
let snapshotWriteQueue: Promise<unknown> = Promise.resolve();
function saveCounterSnapshotWithCurrentMatrices(snapshot: Parameters<typeof upsertCounterSyncSnapshot>[0]) {
  const job = snapshotWriteQueue.then(async () => {
    const localMatrices = getBrawlScopeMatchupMatrices();
    const current = await getCounterSyncSnapshot();
    const currentPayload = parseSnapshotPayload(current?.payload);
    const storedMatrices = currentPayload?.matchupMatrices
      ? decodeMatchupMatrices(currentPayload.matchupMatrices)
      : {};
    const views = new Set([...Object.keys(storedMatrices), ...Object.keys(localMatrices)]);
    const mergedMatrices = Object.fromEntries(Array.from(views, (view) => {
      const owners = new Set([
        ...Object.keys(storedMatrices[view] ?? {}),
        ...Object.keys(localMatrices[view] ?? {}),
      ]);
      return [view, Object.fromEntries(Array.from(owners, (owner) => [owner, {
        ...(storedMatrices[view]?.[owner] ?? {}),
        ...(localMatrices[view]?.[owner] ?? {}),
      }]))];
    }));
    const storedCaptures = currentPayload?.browserCaptures ?? [];
    const captureMap = new Map(storedCaptures.map((capture) => [`${capture.view}:${capture.brawler}`, capture]));
    for (const capture of browserCaptures.values()) captureMap.set(`${capture.view}:${capture.brawler}`, capture);
    return upsertCounterSyncSnapshot({
      ...snapshot,
      payload: JSON.stringify({
        ...JSON.parse(snapshot.payload),
        matchupMatrices: encodeMatchupMatrices(mergedMatrices, brawlScopeMatricesCapturedAt ?? currentPayload?.matchupMatrices?.capturedAt),
        browserCaptures: Array.from(captureMap.values()),
      }),
    });
  });
  snapshotWriteQueue = job.catch(() => undefined);
  return job;
}

/** Matriz literal das guias públicas PL Prodigy, preservada até haver parser seguro para remoções. */
/**
 * Recolha em direto das guias do PL Prodigy.
 *
 * Esta fonte era a única das três que nunca atualizava sozinha: existia apenas
 * como catálogo no repositório, escrito por um script corrido à mão. Passa a
 * ser lida no mesmo ciclo das outras.
 *
 * A disciplina é a mesma que a rotação Ranked usa: se a recolha trouxer poucas
 * guias — parser partido, site em manutenção, bloqueio — o resultado NÃO é
 * aceite como "a fonte deixou de publicar". Devolve-se o catálogo do projeto e
 * diz-se porquê.
 */
async function collectPLProdigy(now: string): Promise<CounterSyncSourceCollection> {
  const roster = Array.from(new Set(Object.values(plProdigyCounterData).map((entry) => entry.brawler)));
  if (!roster.length) return buildStaticPLProdigyCollection(now);

  const host = hostDe(PL_PRODIGY_BASE_URL);
  const saude = sourceHealth.get(host);
  if (saude && saude.blockedUntil > Date.now()) {
    const base = buildStaticPLProdigyCollection(now);
    return { ...base, state: { ...base.state, note: `${host} bloqueou a recolha (HTTP ${saude.lastStatus ?? "?"}); catálogo do projeto mantido.` } };
  }

  const erros: string[] = [];
  const lidas = await mapWithConcurrency(roster, 2, async (brawler) => {
    const html = await fetchText(plProdigyGuideUrl(brawler));
    const guia = parsePLProdigyGuide(html, brawler, roster);
    if (!guia) throw new Error(`${brawler}: guia sem as duas secções de matchup`);
    return guia;
  });

  const guias = lidas
    .filter((item): item is PromiseFulfilledResult<PLProdigyGuide> => item.status === "fulfilled")
    .map((item) => item.value);
  for (const item of lidas) {
    if (item.status === "rejected") erros.push(item.reason instanceof Error ? item.reason.message : String(item.reason));
  }

  if (guias.length < PL_PRODIGY_MIN_GUIDES) {
    const base = buildStaticPLProdigyCollection(now);
    return {
      ...base,
      state: {
        ...base.state,
        note: `Apenas ${guias.length}/${roster.length} guias lidas (mínimo ${PL_PRODIGY_MIN_GUIDES}); catálogo do projeto mantido. ${erros.slice(0, 2).join(" | ")}`.trim(),
      },
    };
  }

  const relations: RelationDraft[] = [];
  for (const guia of guias) {
    for (const defender of guia.targets) {
      relations.push({ owner: guia.brawler, direction: "targets", attacker: guia.brawler, defender, source: "prodigy", sourceUrl: guia.sourceUrl });
    }
    for (const attacker of guia.counteredBy) {
      relations.push({ owner: guia.brawler, direction: "counteredBy", attacker, defender: guia.brawler, source: "prodigy", sourceUrl: guia.sourceUrl });
    }
  }

  const completa = guias.length === roster.length;
  return {
    source: "prodigy",
    state: {
      status: completa ? "success" : "partial",
      /**
       * `complete` é o que autoriza remoções por ausência. Só uma leitura
       * integral do roster pode servir de prova de que uma relação deixou de
       * ser publicada.
       */
      complete: completa,
      fetchedAt: now,
      brawlers: guias.map((guia) => guia.brawler),
      relationCount: uniqueRelations(relations).length,
      note: erros.length
        ? `${guias.length}/${roster.length} guias lidas em direto. ${erros.slice(0, 2).join(" | ")}`
        : `${guias.length} guias lidas em direto.`,
    },
    relations: uniqueRelations(relations),
    activeBrawlers: guias.map((guia) => guia.brawler),
  };
}

export function buildStaticPLProdigyCollection(now: string): CounterSyncSourceCollection {
  const relations: RelationDraft[] = [];
  const brawlers: string[] = [];
  for (const entry of Object.values(plProdigyCounterData)) {
    brawlers.push(entry.brawler);
    for (const defender of entry.targets) {
      relations.push({ owner: entry.brawler, direction: "targets", attacker: entry.brawler, defender, source: "prodigy", sourceUrl: entry.sourceUrl });
    }
    for (const attacker of entry.counteredBy) {
      relations.push({ owner: entry.brawler, direction: "counteredBy", attacker, defender: entry.brawler, source: "prodigy", sourceUrl: entry.sourceUrl });
    }
  }
  return {
    source: "prodigy",
    state: {
      status: "static",
      complete: false,
      fetchedAt: now,
      brawlers: Array.from(new Set(brawlers)),
      relationCount: uniqueRelations(relations).length,
      note: "Matriz literal pública PL Prodigy, mantida até existir leitura estruturada segura para remoções.",
    },
    relations: uniqueRelations(relations),
  };
}

function findPlanetSlugs(indexHtml: string) {
  const matches = Array.from(indexHtml.matchAll(/href=["']\/brawlers\/([^"'/?#]+)["']/gi));
  return Array.from(new Set(matches.map(match => decodeURIComponent(match[1]).trim()).filter(Boolean)));
}

function planetSectionHtml(pageHtml: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<h3[^>]*>\\s*${escaped}\\s*<\\/h3>`, "i");
  const match = pattern.exec(pageHtml);
  if (!match || match.index === undefined) return "";
  const after = pageHtml.slice(match.index + match[0].length);
  const nextHeading = after.search(/<h3[^>]*>/i);
  const nextSection = after.search(/<\/section>/i);
  const end = [nextHeading, nextSection].filter(value => value >= 0).sort((a, b) => a - b)[0] ?? after.length;
  return after.slice(0, end);
}

function signedDelta(value: string) {
  const match = value.match(/([+−-])\s*(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const number = Number(match[2]);
  return match[1] === "-" || match[1] === "−" ? -number : number;
}

function planetRelations(section: string, knownNames: Map<string, string>) {
  const relations: Array<{ brawler: string; delta?: number }> = [];
  const seen = new Set<string>();
  for (const match of Array.from(section.matchAll(/<a[^>]*href=["']\/brawlers\/([^"'/?#]+)["'][^>]*>([\s\S]*?)<\/a>/gi))) {
    const slug = decodeURIComponent(match[1]).trim();
    const brawler = knownNames.get(slug);
    if (!brawler || seen.has(slug)) continue;
    const delta = signedDelta(textContent(match[2]));
    if (delta === undefined) continue;
    seen.add(slug);
    relations.push({ brawler, delta });
  }
  return relations;
}

function planetProfileName(pageHtml: string) {
  const match = pageHtml.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i);
  return match ? textContent(match[1]) : undefined;
}

async function collectBrawlPlanet(now: string): Promise<CounterSyncSourceCollection> {
  try {
    const indexHtml = await fetchText(`${BRAWL_PLANET_BASE_URL}/brawlers`);
    const slugs = findPlanetSlugs(indexHtml);
    if (slugs.length < MIN_VALID_BRAWLER_COVERAGE) {
      throw new Error(`Índice incompleto: apenas ${slugs.length} fichas encontradas.`);
    }

    const settled = await mapWithConcurrency(slugs, 2, async slug => {
      const sourceUrl = `${BRAWL_PLANET_BASE_URL}/brawlers/${encodeURIComponent(slug)}`;
      const html = await fetchText(sourceUrl);
      const brawler = planetProfileName(html);
      if (!brawler) throw new Error(`Nome ausente em ${sourceUrl}`);
      return { slug, sourceUrl, brawler, html };
    });
    const fetched = settled.filter((item): item is PromiseFulfilledResult<{ slug: string; sourceUrl: string; brawler: string; html: string }> => item.status === "fulfilled").map(item => item.value);
    const knownNames = new Map(fetched.map(item => [item.slug, item.brawler]));
    const relations: RelationDraft[] = [];
    const synergies: SynergyDraft[] = [];

    for (const profile of fetched) {
      // "Best Teammates" é a lista de sinergia literal do Brawl Planet, com o
      // delta publicado. É lida na mesma passagem para o Draft deixar de
      // depender do catálogo estático quando a fonte responde.
      planetRelations(planetSectionHtml(profile.html, "Best Teammates"), knownNames).forEach((teammate, index) => {
        synergies.push({ owner: profile.brawler, teammate: teammate.brawler, rank: index + 1, delta: teammate.delta, source: "planet", sourceUrl: profile.sourceUrl });
      });
      for (const target of planetRelations(planetSectionHtml(profile.html, "Strong Against"), knownNames)) {
        relations.push({ owner: profile.brawler, direction: "targets", attacker: profile.brawler, defender: target.brawler, delta: target.delta, source: "planet", sourceUrl: profile.sourceUrl });
      }
      for (const counter of planetRelations(planetSectionHtml(profile.html, "Struggles Against"), knownNames)) {
        relations.push({ owner: profile.brawler, direction: "counteredBy", attacker: counter.brawler, defender: profile.brawler, delta: counter.delta, source: "planet", sourceUrl: profile.sourceUrl });
      }
    }

    const complete = fetched.length === slugs.length && fetched.length >= MIN_VALID_BRAWLER_COVERAGE;
    return {
      source: "planet",
      state: {
        status: complete ? "success" : "partial",
        complete,
        fetchedAt: now,
        brawlers: fetched.map(item => item.brawler),
        relationCount: uniqueRelations(relations).length,
        note: complete ? undefined : `${slugs.length - fetched.length} fichas falharam; ausências não podem remover relações.`,
      },
      relations: uniqueRelations(relations),
      synergies: uniqueSynergies(synergies),
    };
  } catch (error) {
    return {
      source: "planet",
      state: { status: "failed", complete: false, fetchedAt: now, brawlers: [], relationCount: 0, note: error instanceof Error ? error.message : "Falha desconhecida" },
      relations: [],
    };
  }
}

function findCalculatorSlugs(indexHtml: string) {
  const matches = Array.from(indexHtml.matchAll(/href=["']\/counters\/([^"'/?#]+)\/["']/gi));
  return Array.from(new Set(matches.map(match => decodeURIComponent(match[1]).trim()).filter(Boolean)));
}

function calculatorSectionAfter(pageHtml: string, heading: RegExp) {
  const match = heading.exec(pageHtml);
  if (!match || match.index === undefined) return "";
  const after = pageHtml.slice(match.index + match[0].length);
  const nextHeading = after.search(/<h2[^>]*>/i);
  const nextSection = after.search(/<\/section>/i);
  const end = [nextHeading, nextSection].filter(value => value >= 0).sort((a, b) => a - b)[0] ?? after.length;
  return after.slice(0, end);
}

function calculatorRelations(section: string) {
  const relations: Array<{ brawler: string; reason?: string }> = [];
  const seen = new Set<string>();
  for (const match of Array.from(section.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))) {
    const row = match[1];
    const link = /href=["']\/counters\/([^"'/?#]+)\/["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!link) continue;
    const slug = decodeURIComponent(link[1]).trim();
    if (seen.has(slug)) continue;
    const nameMatch = /<span[^>]*>([\s\S]*?)<\/span>/i.exec(link[2]);
    const brawler = textContent(nameMatch?.[1] ?? link[2]);
    if (!brawler) continue;
    const reasonMatch = /<p[^>]*class=["'][^"']*why[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(row);
    seen.add(slug);
    relations.push({ brawler, reason: textContent(reasonMatch?.[1] ?? "") || undefined });
  }
  return relations;
}

function calculatorProfileName(pageHtml: string) {
  const match = /<h1[^>]*>\s*([^<]+?)\s+Counters\s*<\/h1>/i.exec(pageHtml);
  return match ? textContent(match[1]) : undefined;
}

async function collectBrawlCalculator(now: string): Promise<CounterSyncSourceCollection> {
  try {
    const indexHtml = await fetchText(`${BRAWL_CALCULATOR_BASE_URL}/counters/`);
    const slugs = findCalculatorSlugs(indexHtml);
    if (slugs.length < MIN_VALID_BRAWLER_COVERAGE) {
      throw new Error(`Índice incompleto: apenas ${slugs.length} fichas encontradas.`);
    }

    const settled = await mapWithConcurrency(slugs, 2, async slug => {
      const sourceUrl = `${BRAWL_CALCULATOR_BASE_URL}/counters/${encodeURIComponent(slug)}/`;
      const html = await fetchText(sourceUrl);
      const brawler = calculatorProfileName(html);
      if (!brawler) throw new Error(`Nome ausente em ${sourceUrl}`);
      return { sourceUrl, brawler, html };
    });
    const fetched = settled.filter((item): item is PromiseFulfilledResult<{ sourceUrl: string; brawler: string; html: string }> => item.status === "fulfilled").map(item => item.value);
    const relations: RelationDraft[] = [];

    for (const profile of fetched) {
      for (const counter of calculatorRelations(calculatorSectionAfter(profile.html, /<h2[^>]*>\s*Best counters to\s+[^<]+<\/h2>/i))) {
        relations.push({ owner: profile.brawler, direction: "counteredBy", attacker: counter.brawler, defender: profile.brawler, reason: counter.reason, source: "calculator", sourceUrl: profile.sourceUrl });
      }
      for (const target of calculatorRelations(calculatorSectionAfter(profile.html, /<h2[^>]*>\s*[^<]+\s+is a strong pick against\s*<\/h2>/i))) {
        relations.push({ owner: profile.brawler, direction: "targets", attacker: profile.brawler, defender: target.brawler, reason: target.reason, source: "calculator", sourceUrl: profile.sourceUrl });
      }
    }

    const complete = fetched.length === slugs.length && fetched.length >= MIN_VALID_BRAWLER_COVERAGE;
    return {
      source: "calculator",
      state: {
        status: complete ? "success" : "partial",
        complete,
        fetchedAt: now,
        brawlers: fetched.map(item => item.brawler),
        relationCount: uniqueRelations(relations).length,
        note: complete ? undefined : `${slugs.length - fetched.length} fichas falharam; ausências não podem remover relações.`,
      },
      relations: uniqueRelations(relations),
    };
  } catch (error) {
    return {
      source: "calculator",
      state: { status: "failed", complete: false, fetchedAt: now, brawlers: [], relationCount: 0, note: error instanceof Error ? error.message : "Falha desconhecida" },
      relations: [],
    };
  }
}

function parseSnapshotPayload(raw?: string): CounterSyncSnapshotPayload | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as CounterSyncSnapshotPayload;
    return parsed?.schemaVersion === 2 && Array.isArray(parsed.relations) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Junta uma nova leitura ao último snapshot. A remoção só é confirmada após
 * duas leituras completas das fontes dinâmicas sem uma única evidência.
 * Relações globais auditadas ficam protegidas; relações BrawlScope com modeId
 * podem ser removidas quando o modo deixar de publicá-las em duas leituras.
 */
export function mergeCounterSyncPayload(
  previous: CounterSyncSnapshotPayload | undefined,
  collections: CounterSyncSourceCollection[],
  capturedAt: string,
): CounterSyncSnapshotPayload {
  const sourceStates = Object.fromEntries(collections.map(collection => [collection.source, collection.state])) as CounterSyncSnapshotPayload["sourceStates"];
  const current = uniqueRelations(collections.filter(collection => collection.source !== "calculator").flatMap(collection => collection.relations));
  const previousByPair = new Map<string, SyncedCounterRelation[]>();
  for (const relation of previous?.relations ?? []) {
    if (relation.source === "calculator") continue;
    const key = counterRelationContextKey(relation.attacker, relation.defender, relation.modeId);
    previousByPair.set(key, [...(previousByPair.get(key) ?? []), relation]);
  }
  const currentByPair = new Map<string, RelationDraft[]>();
  for (const relation of current) {
    const key = counterRelationContextKey(relation.attacker, relation.defender, relation.modeId);
    currentByPair.set(key, [...(currentByPair.get(key) ?? []), relation]);
  }

  const allKeys = new Set([...Array.from(previousByPair.keys()), ...Array.from(currentByPair.keys())]);
  const absenceStreaks: Record<string, number> = {};
  const relations: SyncedCounterRelation[] = [];
  const dynamicReadsComplete = sourceStates.planet.complete;
  for (const key of Array.from(allKeys)) {
    const observed = currentByPair.get(key) ?? [];
    const prior = previousByPair.get(key) ?? [];
    if (observed.length > 0) {
      relations.push(...observed);
      continue;
    }

    const modeReadsComplete = !prior.some((relation) => relation.modeId) || sourceStates.brawlscope.complete;
    const relationReadsComplete = prior.length > 0 && dynamicReadsComplete && modeReadsComplete;
    const streakKey = prior[0]?.modeId ? key : counterRelationKey(prior[0]?.attacker ?? observed[0]?.attacker ?? "", prior[0]?.defender ?? observed[0]?.defender ?? "");
    const previousStreak = previous?.absenceStreaks?.[streakKey] ?? previous?.absenceStreaks?.[key] ?? 0;
    const nextStreak = relationReadsComplete ? previousStreak + 1 : previousStreak;

    if (nextStreak >= 2 && relationReadsComplete) continue;
    absenceStreaks[streakKey] = nextStreak;
    relations.push(...prior.map(relation => ({
      ...relation,
      pendingRemoval: nextStreak > 0,
    })));
  }

  // Sinergias seguem a mesma disciplina das relações: uma leitura completa sem
  // evidência marca `pendingRemoval`; só a segunda remove. Fontes estáticas
  // nunca removem, porque não têm leitura capaz de confirmar ausência.
  const currentSynergies = uniqueSynergies(collections.flatMap((collection) => collection.synergies ?? []));
  const synergyKey = (entry: { source: CounterSyncSourceKey; owner: string; teammate: string; modeId?: string }) =>
    `synergy:${entry.source}:${synergyRelationContextKey(entry.owner, entry.teammate, entry.modeId)}`;
  const currentSynergyByKey = new Map(currentSynergies.map((entry) => [synergyKey(entry), entry]));
  const previousSynergyByKey = new Map((previous?.synergies ?? []).map((entry) => [synergyKey(entry), entry]));
  const synergies: SyncedSynergyRelation[] = [];
  for (const key of Array.from(new Set([...Array.from(previousSynergyByKey.keys()), ...Array.from(currentSynergyByKey.keys())]))) {
    const observed = currentSynergyByKey.get(key);
    if (observed) {
      synergies.push(observed);
      continue;
    }
    const prior = previousSynergyByKey.get(key);
    if (!prior) continue;
    const readComplete = prior.source === "brawlscope"
      ? sourceStates.brawlscope.complete
      : prior.source === "planet"
        ? sourceStates.planet.complete
        : false;
    const previousStreak = previous?.absenceStreaks?.[key] ?? 0;
    const nextStreak = readComplete ? previousStreak + 1 : previousStreak;
    if (nextStreak >= 2 && readComplete) continue;
    absenceStreaks[key] = nextStreak;
    synergies.push({ ...prior, pendingRemoval: nextStreak > 0 });
  }

  const activeBrawlers = uniqueCounterBrawlerNames([
    ...collections.filter(collection => collection.source === "brawlscope").flatMap(collection => [...(collection.activeBrawlers ?? []), ...collection.state.brawlers]),
    ...collections.flatMap(collection => [...(collection.activeBrawlers ?? []), ...collection.state.brawlers]),
  ]);
  return {
    schemaVersion: 2,
    capturedAt,
    sourceStates,
    activeBrawlers: activeBrawlers.length ? activeBrawlers : previous?.activeBrawlers,
    relations: uniqueRelations(relations),
    synergies: uniqueSynergies(synergies),
    absenceStreaks,
  };
}

export async function getPublicCounterSyncSnapshot() {
  const snapshot = await getCounterSyncSnapshot();
  if (!snapshot) return undefined;
  const payload = parseSnapshotPayload(snapshot.payload);
  if (!payload) return undefined;
  /**
   * As matrizes ficam na cópia gravada, nunca na que sai daqui. Esta função
   * alimenta o evento SSE inicial e a fusão da snapshot seguinte: deixá-las
   * passar mandava centenas de milhares de números para cada visitante e
   * arrastava-as de snapshot em snapshot.
   */
  const publicPayload = toPublicCounterSnapshotPayload(payload);
  return {
    ...snapshot,
    payload: {
      ...publicPayload,
      sourceStates: Object.fromEntries(Object.entries(publicPayload.sourceStates).map(([source, state]) => [
        source,
        { ...state, note: publicSourceNote(state.note) },
      ])) as CounterSyncSnapshotPayload["sourceStates"],
    },
  };
}

export async function syncCounterData(trigger: SyncTrigger) {
  // A instância Vercel pode reiniciar entre ciclos; carregar primeiro o que foi
  // gravado evita que uma sincronização sem acesso ao BrawlScope sobrescreva
  // as matrizes importadas pelo navegador com uma matriz vazia.
  await restoreBrawlScopeMatchupMatrices();
  const runId = await createCounterSyncRun(trigger);
  const startedAt = new Date();
  await updateCounterSyncConfig({ lastStatus: "running", lastStartedAt: startedAt, lastError: null });

  try {
    const capturedAt = new Date().toISOString();
    reportSyncJobProgress(COUNTER_SYNC_JOB, "Brawl Planet e BrawlScope · a recolher");
    // Um pedido manual força a releitura completa; o agendado mantém o ritmo lento.
    const [planet, brawlScope] = await Promise.all([
      collectBrawlPlanet(capturedAt),
      collectBrawlScopeModes(capturedAt, { force: trigger === "manual" }),
    ]);
    const calculator: CounterSyncSourceCollection = { source: "calculator", relations: [], state: {
      status: "static", complete: false, fetchedAt: capturedAt, brawlers: [], relationCount: 0,
      note: "Fonte desativada; não participa de cálculos nem validações.",
    } };
    reportSyncJobProgress(COUNTER_SYNC_JOB, "PL Prodigy · a ler guias");
    const prodigy = await collectPLProdigy(capturedAt);
    reportSyncJobProgress(COUNTER_SYNC_JOB, "a juntar e gravar a snapshot");
    const previous = await getPublicCounterSyncSnapshot();
    const payload = mergeCounterSyncPayload(previous?.payload, [brawlScope, prodigy, calculator, planet], capturedAt);
    const version = `counter-${Date.now()}`;

    /**
     * As matrizes seguem para a base de dados, mas NÃO para os clientes. São
     * centenas de milhares de números; enviá-las no evento SSE a cada
     * sincronização era mandar um megabyte para cada separador aberto, quando o
     * Draft só precisa da vista que está a usar — e essa pede-a à parte.
     */
    const storedPayload: CounterSyncSnapshotPayload = {
      ...payload,
      browserCaptures: Array.from(browserCaptures.values()),
      matchupMatrices: encodeMatchupMatrices(getBrawlScopeMatchupMatrices(), brawlScopeMatricesCapturedAt),
    };

    await saveCounterSnapshotWithCurrentMatrices({
      id: 1,
      version,
      capturedAt: new Date(capturedAt),
      relationCount: payload.relations.length,
      brawlScopeStatus: payload.sourceStates.brawlscope.status,
      calculatorStatus: payload.sourceStates.calculator.status,
      planetStatus: payload.sourceStates.planet.status,
      sourceNotes: [payload.sourceStates.brawlscope.note, payload.sourceStates.prodigy.note, payload.sourceStates.calculator.note, payload.sourceStates.planet.note].filter(Boolean).join(" | ") || null,
      payload: JSON.stringify(storedPayload),
    });
    await insertCounterSyncEvidence(payload.relations.filter(relation => !relation.pendingRemoval).map(relation => ({
      snapshotVersion: version,
      source: relation.source,
      attacker: relation.attacker,
      defender: relation.defender,
      sourceUrl: relation.sourceUrl,
      observedAt: new Date(capturedAt),
    })));
    broadcastCounterSnapshot({ version, capturedAt, payload });
    await updateCounterSyncConfig({ lastStatus: "success", lastCompletedAt: new Date(), lastError: null });
    if (runId) await updateCounterSyncRun(runId, {
      status: "success",
      relationCount: payload.relations.length,
      completedAt: new Date(),
      brawlScopeStatus: payload.sourceStates.brawlscope.status,
      calculatorStatus: payload.sourceStates.calculator.status,
      planetStatus: payload.sourceStates.planet.status,
    });
    return {
      ok: true as const,
      version,
      relationCount: payload.relations.length,
      /** O que a origem devolveu neste pedido, para a interface não prometer o que não houve. */
      sourceNote: [payload.sourceStates.brawlscope.note, payload.sourceStates.planet.note].filter(Boolean).join(" | ") || null,
      synergyCount: payload.synergies?.length ?? 0,
      matchupCoverage: getBrawlScopeMatchupCoverage(),
      payload,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    await updateCounterSyncConfig({ lastStatus: "failed", lastCompletedAt: new Date(), lastError: message });
    if (runId) await updateCounterSyncRun(runId, { status: "failed", completedAt: new Date(), error: message });
    return { ok: false as const, error: message };
  }
}

/** Publish validated browser captures without fetching any external source. */
export async function publishImportedCaptures() {
  await restoreBrawlScopeMatchupMatrices();
  const job = snapshotWriteQueue.then(async () => {
    const stored = await getCounterSyncSnapshot();
    const previous = parseSnapshotPayload(stored?.payload);
    if (!stored || !previous) throw new Error("Não existe snapshot guardada para publicar. Verifica a base de dados.");
    const captures = Array.from(browserCaptures.values());
    if (!captures.length) throw new Error("Não há fichas importadas para publicar.");
    const capturedAt = new Date().toISOString();
    const payload = applyCapturedProfiles(previous, captures, capturedAt);
    const version = `browser-${Date.now()}`;
    const saved = await upsertCounterSyncSnapshot({ ...stored, version, capturedAt: new Date(capturedAt), relationCount: payload.relations.length, brawlScopeStatus: payload.sourceStates.brawlscope.status,
      payload: JSON.stringify({ ...payload, browserCaptures: captures, matchupMatrices: encodeMatchupMatrices(getBrawlScopeMatchupMatrices(), brawlScopeMatricesCapturedAt) }),
    });
    let confirmed = saved;
    for (let attempt = 0; attempt < 3 && confirmed?.version !== version; attempt += 1) {
      await dormir(250 * (attempt + 1));
      confirmed = await getCounterSyncSnapshot();
    }
    if (confirmed?.version !== version || !confirmed.payload) throw new Error("Publicação não confirmada pela base de dados após 3 tentativas.");
    delete payload.browserCaptures; delete payload.matchupMatrices;
    broadcastCounterSnapshot({ version, capturedAt, payload });
    return { ok: true as const, version, profiles: captures.length };
  });
  snapshotWriteQueue = job.catch(() => undefined);
  return job;
}
