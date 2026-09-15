/**
 * Descoberta dos endereços das fichas do BrawlScope.
 *
 * POR QUE ESTE FICHEIRO EXISTE
 *
 * A recolha começava por ler o índice `/counters` e extrair de lá os `href` das
 * fichas. Isso deixou de funcionar: o índice do BrawlScope passou a construir a
 * lista no navegador, e o HTML que o servidor devolve já não tem nenhum link
 * `/counters/<slug>`. O `sitemap.xml` também não os publica.
 *
 * O efeito era silencioso e total. `findBrawlScopeSlugs` devolvia zero nomes, a
 * guarda `slugs.length < 80` disparava, a vista era marcada como falhada, e o
 * ciclo seguinte repetia exatamente o mesmo. Counters gerais, counters por modo
 * e sinergias "Pair with" ficaram congelados no catálogo do repositório — sem
 * erro visível, porque o resto do sistema (Ranked, Brawl Planet, PL Prodigy)
 * continuava a atualizar normalmente.
 *
 * As FICHAS continuam a ser servidas pelo servidor, com dados completos:
 * `/counters/shelly` e `/counters/shelly?mode=knockout` respondem com a tabela
 * "Every matchup" e a secção "Pair with". O que se perdeu foi a lista, não os
 * dados. Portanto o índice deixa de ser a única fonte de endereços: quando não
 * der nada, usa-se o roster que o projeto já conhece.
 *
 * O índice continua a ser tentado primeiro, de propósito. Se a fonte voltar a
 * publicar os links, ela volta a mandar — inclusive sobre brawlers novos que o
 * catálogo local ainda não tem.
 */

import { brawlScopeCounterData } from "./brawlScopeCounterData";

/**
 * Mínimo de fichas para uma vista ser aceite. O roster ronda os 106; abaixo de
 * 80 assume-se leitura incompleta em vez de "a fonte encolheu".
 */
export const MIN_BRAWLSCOPE_SLUGS = 80;

/**
 * O catálogo do repositório guarda o endereço na forma `?brawler=<slug>`, que
 * NEM SEMPRE é igual ao slug do caminho `/counters/<slug>`. Só um diverge, e
 * está verificado contra o site: `/counters/larry-and-lawrie` devolve 404,
 * `/counters/larry-lawrie` devolve a ficha.
 */
const PATH_SLUG_OVERRIDES: Record<string, string> = {
  "larry-and-lawrie": "larry-lawrie",
};

/**
 * Regra de slug do BrawlScope, a partir do nome publicado.
 *
 * Verificada contra as fichas reais, incluindo os casos que costumam partir
 * regras deste género: "8-Bit" → `8-bit`, "Mr. P" → `mr-p`, "R-T" → `r-t`,
 * "Jae-Yong" → `jae-yong`, "Starr Nova" → `starr-nova`, "El Primo" →
 * `el-primo`, "Larry & Lawrie" → `larry-lawrie`.
 */
export function brawlScopeSlugFromName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Endereços conhecidos: as chaves do catálogo do repositório, corrigidas para a
 * forma de caminho, mais qualquer nome extra que o roster em direto já tenha
 * descoberto e o catálogo ainda não conheça.
 */
export function knownBrawlScopeSlugs(extraNames: readonly string[] = []) {
  const slugs = new Set<string>();
  for (const key of Object.keys(brawlScopeCounterData)) {
    slugs.add(PATH_SLUG_OVERRIDES[key] ?? key);
  }
  for (const name of extraNames) {
    const slug = brawlScopeSlugFromName(name);
    if (slug) slugs.add(PATH_SLUG_OVERRIDES[slug] ?? slug);
  }
  return Array.from(slugs).sort();
}

/** Extrai `/counters/<slug>` do HTML do índice, quando a fonte os publica. */
export function findBrawlScopeSlugsInIndex(indexHtml: string, modeId?: string) {
  if (typeof indexHtml !== "string" || !indexHtml) return [];
  const pattern = modeId
    ? new RegExp(`href=["']\\/counters\\/([^"'?]+)\\?mode=${modeId}["']`, "gi")
    : /href=["']\/counters\/([^"'?#]+)(?:\?[^"']*)?["']/gi;
  return Array.from(
    new Set(
      Array.from(indexHtml.matchAll(pattern))
        .map((match) => decodeURIComponent(match[1]).trim())
        .filter(Boolean),
    ),
  );
}

export type BrawlScopeSlugResolution = {
  slugs: string[];
  /** `index` quando a fonte ainda publica os links; `roster` quando foi preciso o plano B. */
  origin: "index" | "roster";
  indexCount: number;
};

/**
 * Resolve a lista de fichas a ler para uma vista.
 *
 * Devolve também de onde veio a lista: a interface diz a verdade sobre a
 * recolha, e se um dia o índice voltar a funcionar isso fica visível sem ser
 * preciso ler logs.
 */
export function resolveBrawlScopeSlugs(
  indexHtml: string,
  options?: { modeId?: string; extraNames?: readonly string[] },
): BrawlScopeSlugResolution {
  const fromIndex = findBrawlScopeSlugsInIndex(indexHtml, options?.modeId);
  if (fromIndex.length >= MIN_BRAWLSCOPE_SLUGS) {
    return { slugs: fromIndex, origin: "index", indexCount: fromIndex.length };
  }
  return {
    slugs: knownBrawlScopeSlugs(options?.extraNames),
    origin: "roster",
    indexCount: fromIndex.length,
  };
}
