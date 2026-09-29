import { allRankedRows } from "@/data/rankedData";
import { additionalBrawlerAssetIds } from "@/data/additionalRankedData";

/**
 * O que a página «Partidas» e a Matriz 1v1 partilham no desenho: a cor de
 * cada modo e o retrato de cada brawler pelo nome (a API escreve os nomes em
 * maiúsculas — «EL PRIMO» —, o catálogo em «El Primo»; compara-se sem olhar a
 * maiúsculas).
 */

/** A cor de cada modo, como o jogo os pinta (nomes dos modos como a API os dá, normalizados). */
export const CORES_DOS_MODOS: Record<string, string> = {
  gemgrab: "#9b5cf6",
  brawlball: "#4f8ff7",
  heist: "#d946ef",
  bounty: "#22c3ee",
  hotzone: "#ef4444",
  knockout: "#f59e0b",
};

const idsDosBrawlers = new Map<string, number>();
const nomesDoCatalogo = new Map<string, string>();
for (const row of allRankedRows) {
  const chave = row.brawler.toLowerCase();
  if (row.brawlerId && !idsDosBrawlers.has(chave)) idsDosBrawlers.set(chave, row.brawlerId);
  if (!nomesDoCatalogo.has(chave)) nomesDoCatalogo.set(chave, row.brawler);
}

export function retratoDe(nome: string) {
  const id = idsDosBrawlers.get(nome.toLowerCase()) ?? additionalBrawlerAssetIds[nome];
  return id ? `https://cdn.brawlify.com/brawlers/borderless/${id}.png` : null;
}

/** «EL PRIMO» → «El Primo», como o resto do site o escreve. */
export function nomeBonito(nome: string) {
  const doCatalogo = nomesDoCatalogo.get(nome.toLowerCase());
  if (doCatalogo) return doCatalogo;
  return nome.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, antes: string, letra: string) => antes + letra.toUpperCase());
}
