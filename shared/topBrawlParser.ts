/**
 * Leitura das páginas do TopBrawl, num sítio que toda a gente pode usar.
 *
 * POR QUE ISTO EXISTE
 *
 * Estava dentro do `server/rankedSync.ts`, que arrasta base de dados, estado de
 * sincronização e meio servidor atrás. Passou a ser preciso noutro sítio: o
 * `topbrawl.com` responde 403 a pedidos vindos do alojamento, e a recolha
 * mudou-se para fora — corre onde a porta está aberta e envia o resultado.
 *
 * Quem lê as páginas passou a ser outro, mas COMO se lê tem de continuar a ser
 * o mesmo. Duas cópias do mesmo interpretador acabam sempre com uma delas a
 * ficar para trás quando a fonte muda a marcação, e essa divergência é
 * silenciosa: os números continuam a aparecer, só que errados.
 *
 * Por isso vive aqui, sem dependências, e é daqui que os dois o leem.
 */

/** O que uma página de mapa publica sobre cada brawler. */
export type TopBrawlRow = {
  brawler: string;
  brawlerId: number;
  /** Já em percentagem (0–100), como o resto do projeto trabalha. */
  topBrawlWinRate: number | null;
  topBrawlUseRate: number | null;
  topBrawlScore: number | null;
};

/**
 * O padrão que reconhece uma linha publicada.
 *
 * A página traz os números em JSON embutido, não na tabela visível — por isso
 * não se lê marcação, lê-se o bloco de dados. Aguenta o JSON aparecer escapado
 * dentro de outra string, que é como os frameworks modernos costumam servi-lo.
 */
const PADRAO_DE_LINHA = /"brawlerId":(\d+),"brawlerName":"((?:\\.|[^"\\])+)"[\s\S]{0,220}?"winRate":(null|[-+0-9.eE]+),"useRate":(null|[-+0-9.eE]+),"effectivityRate":(null|[-+0-9.eE]+)/g;

function numero(valor: string | null | undefined) {
  if (!valor || valor === "null") return null;
  const lido = Number(valor);
  return Number.isFinite(lido) ? lido : null;
}

function texto(fragmento: string) {
  try {
    return JSON.parse(`"${fragmento}"`) as string;
  } catch {
    return fragmento.replace(/\\u([0-9a-f]{4})/gi, (_, codigo: string) => String.fromCharCode(parseInt(codigo, 16)));
  }
}

/**
 * As linhas que uma página de mapa publica.
 *
 * Devolve uma lista simples de propósito: é isto que viaja do sítio onde a
 * página foi lida até ao servidor, e uma lista é fácil de validar à chegada.
 */
export function lerPaginaTopBrawl(html: string): TopBrawlRow[] {
  const linhas: TopBrawlRow[] = [];
  const vistos = new Set<string>();
  const normalizado = html.replaceAll('\\"', '"');
  for (const achado of Array.from(normalizado.matchAll(PADRAO_DE_LINHA))) {
    const brawler = texto(achado[2]);
    if (!brawler || vistos.has(brawler)) continue;
    vistos.add(brawler);
    const winRate = numero(achado[3]);
    const useRate = numero(achado[4]);
    const effectivity = numero(achado[5]);
    linhas.push({
      brawler,
      brawlerId: Number(achado[1]),
      topBrawlWinRate: winRate === null ? null : winRate * 100,
      topBrawlUseRate: useRate === null ? null : useRate * 100,
      topBrawlScore: effectivity === null ? null : effectivity * 20,
    });
  }
  return linhas;
}

/**
 * Os endereços dos mapas no índice público.
 *
 * O índice agrupa os mapas por modo; cada cartão aponta para a página do mapa.
 */
export function lerIndiceTopBrawl(html: string): string[] {
  const ids = new Set<string>();
  for (const achado of html.matchAll(/topbrawl\.com\/rankeds\/(\d+)/g)) ids.add(achado[1]);
  for (const achado of html.matchAll(/href="\/rankeds\/(\d+)"/g)) ids.add(achado[1]);
  return Array.from(ids);
}
