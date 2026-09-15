/**
 * As duas dimensões de filtro que o BrawlScope expõe em cada ficha de counters,
 * verificadas nos links da própria página:
 *
 *   modo:     /counters/<slug>                 → Overall (todos os modos juntos)
 *             /counters/<slug>?mode=knockout   → um modo específico
 *   patente:  /counters/<slug>                 → Legendary+ (é o valor por omissão)
 *             /counters/<slug>?rank=all        → todas as patentes
 *             /counters/<slug>?rank=diamond|mythic|masters
 *
 * Repare-se no detalhe importante: **Legendary+ não tem parâmetro**. É o que a
 * fonte serve quando não se pede patente nenhuma, e é a leitura competitiva que o
 * projeto usa. `rank=all` é que significa "todas as patentes", não o contrário.
 *
 * A vista canónica do projeto é, portanto, Overall + Legendary+: a ficha sem
 * qualquer filtro. As vistas por modo são uma camada adicional, usada quando o
 * Draft conhece o modo do mapa ativo.
 */
export const brawlScopeRanks = [
  { id: "legendary", label: "Lendário+", param: undefined },
  { id: "all", label: "Todas as patentes", param: "all" },
  { id: "diamond", label: "Diamante+", param: "diamond" },
  { id: "mythic", label: "Mítico+", param: "mythic" },
  { id: "masters", label: "Mestres+", param: "masters" },
] as const;

export type BrawlScopeRankId = (typeof brawlScopeRanks)[number]["id"];

/** Patente usada em todas as leituras do projeto quando nada é pedido. */
export const DEFAULT_BRAWLSCOPE_RANK: BrawlScopeRankId = "legendary";

export function brawlScopeRankForId(rankId: string | null | undefined) {
  return brawlScopeRanks.find((rank) => rank.id === rankId);
}

export function normalizeBrawlScopeRankId(rankId: string | null | undefined): BrawlScopeRankId {
  return brawlScopeRankForId(rankId)?.id ?? DEFAULT_BRAWLSCOPE_RANK;
}

export const BRAWLSCOPE_BASE_URL = "https://brawlscope.com";

/**
 * URL da ficha pública para uma combinação de modo e patente. Sem `modeId` devolve
 * a vista Overall; com a patente por omissão não acrescenta `rank`, porque é assim
 * que a fonte a serve — acrescentá-lo mudaria a leitura.
 */
export function brawlScopeProfileUrl(slug: string, options?: { modeId?: string | null; rankId?: string | null }) {
  const params = new URLSearchParams();
  const rank = brawlScopeRankForId(normalizeBrawlScopeRankId(options?.rankId));
  if (options?.modeId) params.set("mode", options.modeId);
  if (rank?.param) params.set("rank", rank.param);
  const query = params.toString();
  return `${BRAWLSCOPE_BASE_URL}/counters/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`;
}

/** Índice de brawlers para a mesma combinação. */
export function brawlScopeIndexUrl(options?: { modeId?: string | null; rankId?: string | null }) {
  const params = new URLSearchParams();
  const rank = brawlScopeRankForId(normalizeBrawlScopeRankId(options?.rankId));
  if (options?.modeId) params.set("mode", options.modeId);
  if (rank?.param) params.set("rank", rank.param);
  const query = params.toString();
  return `${BRAWLSCOPE_BASE_URL}/counters${query ? `?${query}` : ""}`;
}

/** Rótulo legível da vista, para notas de sincronização e auditoria. */
export function describeBrawlScopeView(options?: { modeLabel?: string | null; rankId?: string | null }) {
  const rank = brawlScopeRankForId(normalizeBrawlScopeRankId(options?.rankId));
  return `${options?.modeLabel ?? "Overall"} · ${rank?.label ?? "Lendário+"}`;
}
