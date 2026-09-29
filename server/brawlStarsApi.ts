const URL_OFICIAL = "https://api.brawlstars.com/v1";

/**
 * O proxy público da RoyaleAPI para a API do Brawl Stars.
 *
 * POR QUE EXISTE
 *
 * A Supercell prende cada chave a uma lista de IPs. A Vercel não tem IP de
 * saída fixo: cada função pode sair por um endereço diferente, e o IP fixo é
 * um extra pago que o plano gratuito não tem. Resultado: a chave era recusada
 * com 403 na maior parte dos pedidos, e a recolha de partidas nunca arrancava.
 *
 * A RoyaleAPI mantém este proxy precisamente para isto — servidores sem IP
 * fixo. Os pedidos saem sempre do mesmo IP (`IP_DO_PROXY_ROYALEAPI`), que se
 * acrescenta à chave em developer.brawlstars.com. Os caminhos e a autenticação
 * são os mesmos da API oficial; só muda o domínio.
 *
 * É uma escolha do dono, nunca automática: com o proxy, a chave passa por um
 * serviço de terceiros. Ver https://docs.royaleapi.com/proxy
 */
export const URL_PROXY_ROYALEAPI = "https://bsproxy.royaleapi.dev/v1";
export const IP_DO_PROXY_ROYALEAPI = "45.79.218.79";

export type CaminhoDaApi = "oficial" | "royaleapi";

export function normalizarCaminhoDaApi(valor: unknown): CaminhoDaApi {
  return typeof valor === "string" && valor.trim().toLowerCase() === "royaleapi" ? "royaleapi" : "oficial";
}

let caminhoEmCache: CaminhoDaApi = "oficial";

/** Por onde saem os pedidos. O ambiente tem prioridade, como na chave. */
export function getCaminhoDaApi(): CaminhoDaApi {
  const doAmbiente = (process.env.BRAWL_STARS_API_VIA ?? "").trim();
  if (doAmbiente) return normalizarCaminhoDaApi(doAmbiente);
  return caminhoEmCache;
}

export function setRuntimeApiVia(via: unknown) {
  caminhoEmCache = normalizarCaminhoDaApi(via);
}

/** A base de todos os pedidos à API do Brawl Stars. */
export function urlDaApi() {
  return getCaminhoDaApi() === "royaleapi" ? URL_PROXY_ROYALEAPI : URL_OFICIAL;
}

export type OfficialRankedPlayer = {
  tag?: string;
  name?: string;
};

export type OfficialBattleLogEntry = {
  battleTime?: string;
  event?: { id?: number; mode?: string; map?: string };
  battle?: {
    type?: string;
    result?: string;
    /** Numa partida Ranked, `brawler.trophies` é o nível do rank (ver `shared/ranksDoRanked.ts`). */
    teams?: Array<Array<{ tag?: string; brawler?: { name?: string; trophies?: number } }>>;
  };
};

/**
 * Chave da API oficial, em cache no processo.
 *
 * As funções deste ficheiro são chamadas em ciclos apertados (um pedido por
 * jogador, por batalha), por isso a chave não pode ser ida buscar à base de
 * dados de cada vez. Fica em memória e é reposta quando o dono a muda no site.
 */
let chaveEmCache: string | null = null;

function getApiKey(): string {
  const doAmbiente = (process.env.BRAWL_STARS_API_KEY ?? "").trim();
  if (doAmbiente) return doAmbiente;
  return chaveEmCache ?? "";
}

/** Repõe a chave lida da base de dados. Chamada no arranque e ao gravar. */
export function setRuntimeApiKey(key: string | null) {
  chaveEmCache = key?.trim() || null;
}

/**
 * A API oficial está configurada?
 *
 * Sem chave, todas as funções deste ficheiro devolvem listas vazias em
 * silêncio — o que é seguro, mas indistinguível de "a API não tem dados". O
 * ciclo de recolha precisa de saber a diferença para poder dizer a verdade a
 * quem está a olhar para o painel.
 */
export function isOfficialApiConfigured() {
  return getApiKey().trim().length > 0;
}

/**
 * Testa a chave da API oficial e devolve o motivo exato quando não funciona.
 *
 * As funções normais deste ficheiro engolem o erro e devolvem lista vazia — o
 * que é seguro em produção, mas inútil para diagnosticar: "sem dados" tem três
 * causas possíveis e cada uma resolve-se de forma diferente.
 *
 *  - chave em falta   → definir BRAWL_STARS_API_KEY
 *  - 403              → a chave existe mas o IP declarado não é o do servidor.
 *                       É a falha mais comum, porque a Supercell prende cada
 *                       chave a um IP e o IP de um alojamento na nuvem pode
 *                       mudar num reinício.
 *  - 401              → a chave está errada ou foi revogada
 */
export async function probeOfficialApi(): Promise<{
  configured: boolean;
  ok: boolean;
  status: number | null;
  reason: string;
  /** IP que a Supercell diz ter visto, quando recusa por IP. */
  seenIp?: string;
}> {
  const apiKey = getApiKey().trim();
  if (!apiKey) {
    return { configured: false, ok: false, status: null, reason: "Ainda não há chave da API oficial. Cola-a no campo abaixo, ou define BRAWL_STARS_API_KEY no ambiente." };
  }

  try {
    const res = await fetch(`${urlDaApi()}/brawlers`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.ok) {
      const data = (await res.json()) as { items?: unknown[] };
      return { configured: true, ok: true, status: res.status, reason: `${data.items?.length ?? 0} brawlers no catálogo oficial.` };
    }
    if (res.status === 403) {
      /**
       * A Supercell diz no corpo da resposta qual foi o IP que ela viu.
       *
       * Isto resolve uma ambiguidade que custou tempo: um serviço externo de
       * "qual é o meu IP" respondeu 34.34.225.211, e a Supercell recusou dizendo
       * ter visto 102.141.47.105. Dois valores diferentes para a mesma pergunta,
       * porque quem pergunta e de onde pergunta não eram os mesmos — um teste
       * corrido noutro ambiente não fala da mesma origem que o servidor.
       *
       * A única resposta que conta é a da própria Supercell, ao pedido feito por
       * ESTE processo. É essa que se mostra.
       */
      const corpo = await res.text().catch(() => "");
      const ipVisto = corpo.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/)?.[1];
      return {
        configured: true,
        ok: false,
        status: 403,
        reason: getCaminhoDaApi() === "royaleapi"
          ? `A chave existe, mas a Supercell recusou o pedido vindo do proxy da RoyaleAPI. Confirma que ${IP_DO_PROXY_ROYALEAPI} está na lista de IPs permitidos da chave em developer.brawlstars.com.`
          : ipVisto
            ? `A chave existe, mas a Supercell recusou: viu o pedido vir de ${ipVisto}, que não está na lista de IPs permitidos da chave. Num servidor de IP fixo, acrescenta ${ipVisto} em developer.brawlstars.com — a chave aceita vários IPs, não precisas de criar uma nova. Na Vercel este IP muda a cada pedido: liga a opção "Passar pelo proxy da RoyaleAPI" e acrescenta ${IP_DO_PROXY_ROYALEAPI} à chave.`
            : `A chave existe, mas a Supercell recusou por IP não autorizado. Na Vercel o IP muda a cada pedido — liga a opção "Passar pelo proxy da RoyaleAPI" e acrescenta ${IP_DO_PROXY_ROYALEAPI} à chave.`,
        seenIp: ipVisto,
      };
    }
    if (res.status === 401) {
      return { configured: true, ok: false, status: 401, reason: "A chave é inválida ou foi revogada." };
    }
    return { configured: true, ok: false, status: res.status, reason: `${res.status} ${res.statusText}` };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      status: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchOfficialBrawlers(): Promise<any[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];
  try {
    const res = await fetch(`${urlDaApi()}/brawlers`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.warn(`[BrawlStarsAPI] /brawlers failed: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = (await res.json()) as { items?: any[] };
    return data.items || [];
  } catch (err) {
    console.error("[BrawlStarsAPI] Error fetching brawlers:", err);
    return [];
  }
}

export async function fetchOfficialRankings(countryCode = "global", type = "brawlers"): Promise<any[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];
  try {
    const res = await fetch(`${urlDaApi()}/rankings/${countryCode}/${type}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.warn(`[BrawlStarsAPI] /rankings failed: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = (await res.json()) as { items?: any[] };
    return data.items || [];
  } catch (err) {
    console.error("[BrawlStarsAPI] Error fetching rankings:", err);
    return [];
  }
}

export async function fetchOfficialRankedPlayers(countryCode = "global"): Promise<OfficialRankedPlayer[]> {
  return fetchOfficialRankings(countryCode, "players") as Promise<OfficialRankedPlayer[]>;
}

export async function fetchOfficialBattleLog(playerTag: string): Promise<OfficialBattleLogEntry[]> {
  const apiKey = getApiKey();
  if (!apiKey || !playerTag) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const normalizedTag = playerTag.startsWith("#") ? playerTag : `#${playerTag}`;
    const res = await fetch(`${urlDaApi()}/players/${encodeURIComponent(normalizedTag)}/battlelog`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[BrawlStarsAPI] /battlelog failed for ${normalizedTag}: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = (await res.json()) as { items?: OfficialBattleLogEntry[] };
    return data.items || [];
  } catch (err) {
    console.error(`[BrawlStarsAPI] Error fetching battle log for ${playerTag}:`, err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchOfficialEvents(): Promise<any[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];
  try {
    const res = await fetch(`${urlDaApi()}/events/rotation`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.warn(`[BrawlStarsAPI] /events/rotation failed: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = (await res.json()) as any[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[BrawlStarsAPI] Error fetching events:", err);
    return [];
  }
}
