/**
 * Leitura de uma ficha do BrawlScope colada por uma pessoa.
 *
 * POR QUE O CÓDIGO-FONTE NÃO SERVIA
 *
 * A primeira versão pedia Ctrl+U — ver o código-fonte. O nome do brawler era
 * reconhecido e a tabela "Every matchup" vinha sempre a ZERO. A razão é simples
 * quando se vê: o código-fonte é o que o servidor manda, e o BrawlScope monta
 * essa tabela já no navegador. No código-fonte ela não existe.
 *
 * O que existe, e é muito mais fácil de copiar, é a página COMO SE VÊ. Um
 * Ctrl+A seguido de Ctrl+C, com a página aberta à frente, traz o texto todo já
 * montado — incluindo as 105 linhas de confronto.
 *
 * Por isso esta leitura trabalha sobre TEXTO, não sobre marcação. É também mais
 * resistente: o BrawlScope pode mudar as classes e as etiquetas à vontade que
 * "R-T 64.1% vs 49.0% usual" continua a ler-se igual.
 */

/** Uma linha de confronto tal como a página a mostra. */
export type PastedMatchup = { opponent: string; rate: number; average: number; delta: number };

export type PastedProfile = {
  brawler?: string;
  matchups: PastedMatchup[];
  /** Adversários lidos que o catálogo do projeto ainda não conhece. */
  unknownNames: string[];
  /** Linhas com números que não deram para atribuir a nenhum brawler conhecido. */
  discarded: number;
  /**
   * Linhas lidas que caíram num adversário que já tinha sido lido.
   *
   * Existia e não era contado. Quando a ficha guardava 103 de 105, não havia
   * como saber se a página só tinha 103 — o que é normal, o número muda de
   * brawler para brawler — ou se duas linhas se tinham colapsado numa. As duas
   * situações pareciam iguais, e uma delas é um defeito.
   */
  duplicated: string[];
};

const normalizar = (valor: string) => valor.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * O nome do brawler da ficha.
 *
 * A página escreve-o em vários sítios — "Shelly counters", "Shelly Punishes",
 * "Counters Shelly (top picks)". Qualquer um serve, desde que o nome resultante
 * exista mesmo no roster: sem essa confirmação, uma palavra qualquer do texto
 * passaria por nome.
 */
export function detectPastedBrawler(texto: string, roster: readonly string[]): string | undefined {
  const porNome = new Map(roster.map((nome) => [normalizar(nome), nome]));
  const padroes = [
    /([A-Za-z0-9][A-Za-z0-9 .&'\-]{0,18}?)\s+counters\b/i,
    /([A-Za-z0-9][A-Za-z0-9 .&'\-]{0,18}?)\s+punishes\b/i,
    /counters\s+([A-Za-z0-9][A-Za-z0-9 .&'\-]{0,18}?)\s*\(/i,
    /brawlers\s+that\s+counter\s+([A-Za-z0-9][A-Za-z0-9 .&'\-]{0,18}?)\b/i,
  ];

  for (const padrao of padroes) {
    const bruto = padrao.exec(texto)?.[1]?.trim();
    if (!bruto) continue;
    // Tenta o nome inteiro e, se falhar, as últimas palavras — "Best Shelly"
    // tem de dar "Shelly".
    const palavras = bruto.split(/\s+/);
    for (let inicio = 0; inicio < palavras.length; inicio += 1) {
      const candidato = porNome.get(normalizar(palavras.slice(inicio).join(" ")));
      if (candidato) return candidato;
    }
  }
  return undefined;
}

/**
 * Confrontos publicados, a partir do texto da página.
 *
 * Cada linha tem a forma «NOME  A% vs B% usual · N battles  +D». O ancoradouro é
 * o «A% vs B%»: a partir dele procura-se o nome ATRÁS e o delta À FRENTE.
 *
 * O delta é calculado (A − B) em vez de lido. É a mesma conta que a página faz,
 * e não depende de como o sinal vem escrito — o menos tipográfico "−", o hífen
 * normal, ou um espaço pelo meio já partiram leituras antes. Quando o valor
 * publicado existe e diverge do calculado por mais de duas décimas, a linha é
 * descartada: é sinal de que se juntaram pedaços de linhas diferentes.
 */
export function parsePastedMatchups(texto: string, roster: readonly string[]): PastedProfile {
  const porNome = new Map(roster.map((nome) => [normalizar(nome), nome]));
  // Do nome mais longo para o mais curto: "Larry & Lawrie" antes de "Larry".
  const nomesPorTamanho = [...roster].sort((esquerda, direita) => direita.length - esquerda.length);

  const matchups: PastedMatchup[] = [];
  const unknownNames: string[] = [];
  const vistos = new Set<string>();
  const duplicated: string[] = [];
  let discarded = 0;

  const ancora = /(\d{1,3}(?:[.,]\d+)?)\s*%\s*vs\.?\s*(\d{1,3}(?:[.,]\d+)?)\s*%/gi;
  for (const encontro of texto.matchAll(ancora)) {
    const posicao = encontro.index ?? 0;
    const taxa = Number(encontro[1].replace(",", "."));
    const media = Number(encontro[2].replace(",", "."));
    if (!Number.isFinite(taxa) || !Number.isFinite(media)) { discarded += 1; continue; }

    const nome = nomeAntesDe(texto, posicao, nomesPorTamanho, porNome);
    if (!nome) { discarded += 1; continue; }
    if (!porNome.has(normalizar(nome)) && !unknownNames.includes(nome)) unknownNames.push(nome);

    const calculado = Number((taxa - media).toFixed(1));
    /**
     * Quando a página publica o delta, serve de confirmação — não de fonte.
     *
     * A janela tem de acabar ANTES da linha seguinte, e é o `%` dela que marca
     * esse fim: numa linha os números aparecem por esta ordem — taxa%, média%,
     * delta — por isso a percentagem seguinte já é de outro confronto.
     *
     * Sem esse corte, uma linha cujo delta publicado não traga sinal (o Frank,
     * com 49,3% contra 49,3%, dá 0.0) não encontrava nada seu e ia buscar o
     * número da linha de baixo. Comparava o 0,0 dele com o −0,3 do vizinho, via
     * uma diferença que não existia, e DESCARTAVA um confronto bom. Cento e
     * quatro de cento e cinco, sempre o mesmo a faltar.
     */
    const depoisDaAncora = texto.slice(posicao + encontro[0].length, posicao + encontro[0].length + 160);
    const soDestaLinha = depoisDaAncora.split("%")[0];
    const publicado = soDestaLinha.match(/([+\u2212\u2013-]\s?\d{1,2}(?:[.,]\d+)?)(?!\s*%)/);
    if (publicado) {
      const valor = Number(publicado[1].replace(/[\u2212\u2013]/g, "-").replace(/\s+/g, "").replace(",", "."));
      if (Number.isFinite(valor) && Math.abs(valor - calculado) > 0.2) { discarded += 1; continue; }
    }

    const chave = normalizar(nome);
    if (vistos.has(chave)) {
      duplicated.push(nome);
      continue;
    }
    vistos.add(chave);
    matchups.push({ opponent: nome, rate: taxa, average: media, delta: calculado });
  }

  return { brawler: detectPastedBrawler(texto, roster), matchups, unknownNames, discarded, duplicated };
}

/** Palavras que aparecem nas linhas e nunca são nomes de brawler. */
const PALAVRAS_QUE_NAO_SAO_NOMES = /^(vs|usual|battles|battle|matchup|every|win|rate|counters|punishes|pair|with|top|picks|all|modes)$/i;

/**
 * O nome do adversário, imediatamente antes das percentagens.
 *
 * A primeira versão olhava 80 caracteres para trás e ficava com o último nome
 * conhecido que lá encontrasse. Contra a página real isso perdeu o Surge: o
 * endereço da LINHA ANTERIOR continha "ruffs", e "Ruffs" ganhou a corrida. O
 * confronto desapareceu sem sequer ser contado como descartado — invisível.
 *
 * Agora a janela é cortada no início da linha e os endereços são removidos, de
 * modo que só o texto da própria linha pode responder.
 *
 * E um nome que não esteja no catálogo é ACEITE, não deitado fora. Quando a
 * Supercell lança um brawler, o catálogo do projeto ainda não o conhece — e
 * descartar a coluna dele em silêncio seria perder dados sem ninguém dar por
 * isso. O que se exige é que pareça um nome.
 */
function nomeAntesDe(
  texto: string,
  posicao: number,
  nomesPorTamanho: readonly string[],
  porNome: ReadonlyMap<string, string>,
): string | undefined {
  const bruto = texto.slice(Math.max(0, posicao - 120), posicao);
  // Endereços fora: trazem nomes de outras linhas lá dentro.
  const semLinks = bruto.replace(/https?:\/\/\S+/gi, " ").replace(/\]\(/g, " ");
  // A linha começa depois da última quebra; sem quebras, vale a janela toda.
  const ultimaQuebra = Math.max(semLinks.lastIndexOf("\n"), semLinks.lastIndexOf("\r"));
  const linha = ultimaQuebra >= 0 ? semLinks.slice(ultimaQuebra + 1) : semLinks;

  const procurar = (onde: string) => {
    let melhor: string | undefined;
    let melhorPosicao = -1;
    for (const candidato of nomesPorTamanho) {
      const indice = onde.toLocaleLowerCase().lastIndexOf(candidato.toLocaleLowerCase());
      if (indice > melhorPosicao) { melhorPosicao = indice; melhor = candidato; }
    }
    return melhor ? porNome.get(normalizar(melhor)) ?? melhor : undefined;
  };

  // Primeiro só a linha; o texto colado às vezes parte o nome para a linha de
  // cima, e só então se alarga a procura.
  const naLinha = procurar(linha);
  if (naLinha) return naLinha;

  /**
   * Nenhum nome conhecido nesta linha: pode ser um brawler novo. O que sobra da
   * linha, tirando o número de ordem, tem de parecer um nome.
   */
  const sobra = linha.replace(/^[\s\[\|·]*\d{1,3}[\s.)\]]*/, "").trim();
  const plausivel = sobra.match(/([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&'\-]{0,19})$/)?.[1]?.trim();
  if (plausivel && plausivel.length >= 2 && /[a-zà-ÿ]/i.test(plausivel) && !PALAVRAS_QUE_NAO_SAO_NOMES.test(plausivel)) {
    return plausivel;
  }

  return procurar(semLinks);
}

/** O texto colado é marcação ou é a página como se vê? */
export function looksLikeHtml(conteudo: string) {
  return /<a[^>]+href=["']\/counters\//i.test(conteudo) || /<html[\s>]/i.test(conteudo);
}

/**
 * Brawler e modo a partir do endereço, quando ele é colado.
 *
 * É a informação mais fiável de todas e a mais fácil de dar: a barra de
 * endereços copia-se com dois cliques. Dispensa adivinhar o modo pelo conteúdo,
 * que no texto colado não aparece de forma nenhuma.
 */
export function readBrawlScopeUrl(url: string) {
  try {
    const endereco = new URL(url.trim());
    if (endereco.protocol !== "https:" || !["brawlscope.com", "www.brawlscope.com"].includes(endereco.hostname) || endereco.username || endereco.password || endereco.port) return {};
    const slug = endereco.pathname.match(/\/counters\/([^/?#]+)/i)?.[1];
    const mode = endereco.searchParams.get("mode") ?? undefined;
    return {
      slug: slug ? decodeURIComponent(slug) : undefined,
      mode: mode || undefined,
    };
  } catch {
    return {};
  }
}
