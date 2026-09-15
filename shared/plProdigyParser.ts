/**
 * Leitura das guias públicas do PL Prodigy.
 *
 * A lógica vivia apenas em `server/scripts/import-prodigy-counters.mjs`, um
 * script corrido à mão que escrevia um ficheiro no repositório. Era por isso
 * que esta fonte — ao contrário do BrawlScope e do Brawl Planet — nunca
 * atualizava sozinha: o catálogo era uma fotografia do dia em que alguém se
 * lembrou de correr o comando.
 *
 * Movida para aqui, em funções puras, para poder ser usada pela sincronização e
 * testada com fixtures. O parser é o mesmo que já estava validado contra as
 * páginas reais; o que muda é quem o chama e com que frequência.
 */

export const PL_PRODIGY_BASE_URL = "https://powerleagueprodigy.com";

/** Nomes cujo endereço não sai da regra normal de slug. */
const SLUG_OVERRIDES: Record<string, string> = {
  "8-Bit": "8-bit",
  "El Primo": "el-primo",
  "Mr. P": "mr-p",
  "R-T": "r-t",
  "Jae-Yong": "jae-yong",
  "Larry & Lawrie": "larry-lawrie",
  "Starr Nova": "starr-nova",
};

export function plProdigySlug(name: string) {
  return SLUG_OVERRIDES[name] ?? name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function plProdigyGuideUrl(name: string) {
  return `${PL_PRODIGY_BASE_URL}/${plProdigySlug(name)}`;
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_.-]+/g, "");
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function htmlToText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nomes do roster presentes numa secção, na ordem em que aparecem no texto.
 *
 * Procura-se do nome mais longo para o mais curto para "Larry & Lawrie" não ser
 * confundido com "Larry", e exige-se fronteira de palavra dos dois lados para
 * "Bo" não aparecer dentro de "Bonnie".
 */
function listBrawlersInSection(section: string, roster: readonly string[]) {
  const porTamanho = [...roster].sort((left, right) => right.length - left.length);
  const vistos = new Set<string>();
  const encontrados: Array<{ name: string; at: number }> = [];
  /**
   * O texto vai sendo consumido: cada nome encontrado é substituído por espaços
   * do mesmo comprimento, para que um nome mais curto não volte a encontrá-lo lá
   * dentro. Sem isto, "Larry & Lawrie" fazia aparecer também "Larry", e "Bonnie"
   * fazia aparecer "Bo" — brawlers que a página nunca mencionou entravam na
   * lista e alimentavam o Draft.
   *
   * Procurar do nome mais longo para o mais curto é o que torna a máscara
   * correta: o nome específico é consumido antes do genérico.
   */
  let restante = section;

  for (const name of porTamanho) {
    if (vistos.has(normalize(name))) continue;
    const matcher = new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}(?=$|[^a-z0-9])`, "i");
    const match = matcher.exec(restante);
    if (!match) continue;

    const inicio = match.index + match[1].length;
    vistos.add(normalize(name));
    encontrados.push({ name, at: inicio });
    restante = restante.slice(0, inicio) + " ".repeat(name.length) + restante.slice(inicio + name.length);
  }

  // A ordem publicada importa: é ela que define o Top da fonte.
  return encontrados.sort((left, right) => left.at - right.at).map((item) => item.name);
}

function sliceSection(text: string, startPattern: RegExp, endPatterns: readonly RegExp[]) {
  const start = text.search(startPattern);
  if (start === -1) return null;
  const afterStart = text.slice(start).replace(startPattern, "");
  let end = afterStart.length;
  for (const pattern of endPatterns) {
    const candidate = afterStart.search(pattern);
    if (candidate !== -1 && candidate < end) end = candidate;
  }
  return afterStart.slice(0, end).trim();
}

export type PLProdigyGuide = {
  brawler: string;
  sourceUrl: string;
  targets: string[];
  counteredBy: string[];
};

/**
 * Extrai as duas listas publicadas na guia. Devolve `null` quando a página não
 * tem os dois títulos de matchup — o que acontece com guias antigas e com
 * respostas de erro que chegam com 200. Preferir nada a inventar metade.
 */
export function parsePLProdigyGuide(html: string, brawler: string, roster: readonly string[]): PLProdigyGuide | null {
  if (typeof html !== "string" || html.length < 200) return null;
  const text = htmlToText(html);
  const escaped = escapeRegExp(brawler);

  const targetsSection = sliceSection(
    text,
    new RegExp(`${escaped}\\s+Counters\\s+These\\s+Brawlers`, "i"),
    [/Watch Out/i, new RegExp(`Brawlers\\s+That\\s+Counter\\s+${escaped}`, "i"), /A legacy guide/i, /Privacy Policy/i],
  );
  const counteredBySection = sliceSection(
    text,
    new RegExp(`Brawlers\\s+That\\s+Counter\\s+${escaped}`, "i"),
    [/A legacy guide/i, /Privacy Policy/i, /Support with Code/i],
  );
  if (targetsSection === null || counteredBySection === null) return null;

  const semProprio = (names: string[]) => names.filter((name) => normalize(name) !== normalize(brawler));
  return {
    brawler,
    sourceUrl: plProdigyGuideUrl(brawler),
    targets: semProprio(listBrawlersInSection(targetsSection, roster)),
    counteredBy: semProprio(listBrawlersInSection(counteredBySection, roster)),
  };
}

/**
 * Mínimo de guias lidas para a recolha poder substituir o catálogo do projeto.
 *
 * A mesma disciplina do índice da rotação: se o parser deixar de reconhecer as
 * páginas, o resultado não pode ser aceite como "a fonte deixou de publicar".
 * Abaixo disto mantém-se o catálogo e assinala-se a leitura como incompleta.
 */
export const PL_PRODIGY_MIN_GUIDES = 60;
