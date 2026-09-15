/**
 * Como o projeto lê os matchups do BrawlScope.
 *
 * A fonte publica a mesma tabela em sete vistas: uma geral (Overall, todos os
 * modos juntos) e seis por modo. As duas leituras são legítimas e servem
 * propósitos diferentes:
 *
 * - `overall`  — um único valor por par, estável, bom quando o mapa não importa
 *                ou quando o modo ainda não tem amostra suficiente.
 * - `byMode`   — o valor do modo do mapa ativo, com o global como recurso para
 *                os pares que a vista do modo não publica.
 *
 * A escolha é do utilizador e vive nas regras do Draft.
 */
export const brawlScopeReadings = [
  { id: "overall", label: "Geral", hint: "Um valor por confronto, somando todos os modos." },
  { id: "byMode", label: "Por modo", hint: "Usa a tabela do modo do mapa ativo; sem dados desse modo, recorre ao geral." },
] as const;

export type BrawlScopeReadingId = (typeof brawlScopeReadings)[number]["id"];

/** Leitura usada quando nada foi escolhido. */
export const DEFAULT_BRAWLSCOPE_READING: BrawlScopeReadingId = "byMode";

export function normalizeBrawlScopeReading(value: unknown): BrawlScopeReadingId {
  return brawlScopeReadings.some((reading) => reading.id === value) ? (value as BrawlScopeReadingId) : DEFAULT_BRAWLSCOPE_READING;
}
