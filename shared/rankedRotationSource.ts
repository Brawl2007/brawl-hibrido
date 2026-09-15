/**
 * Leitura da rotação Ranked publicada, para o projeto deixar de depender de uma
 * lista escrita à mão.
 *
 * O índice do TopBrawl (`https://topbrawl.com/rankeds`) agrupa os mapas por modo
 * e liga cada um a `/rankeds/<id>`, onde `<id>` é o identificador oficial do
 * mapa — o mesmo que a recolha por mapa já usa. Isso torna esta página a fonte
 * natural: dá o nome, o modo e o id numa só leitura.
 *
 * ## A regra que torna isto seguro
 *
 * Um parser contra HTML de terceiros parte um dia — mudam uma classe, trocam a
 * estrutura, e de repente lê zero mapas. Se esse resultado fosse aceite, o site
 * concluía que a rotação inteira acabou.
 *
 * Por isso a leitura devolve sempre `complete`, e só é completa quando trouxe
 * pelo menos `MIN_PLAUSIBLE_MAPS` mapas. Abaixo disso trata-se como leitura
 * falhada: aproveita-se o que veio para CONFIRMAR o que existe, e nunca para
 * concluir que algo saiu. É a mesma lógica que o módulo de quarentena aplica a
 * seguir — aqui é apenas a primeira linha de defesa.
 */

/** Modos do índice do TopBrawl para os identificadores usados no projeto. */
const MODE_BY_LABEL: Record<string, { mode: string; modeId: string }> = {
  "gem grab": { mode: "Pique-Gema", modeId: "gem-grab" },
  "gemgrab": { mode: "Pique-Gema", modeId: "gem-grab" },
  "heist": { mode: "Roubo", modeId: "heist" },
  "bounty": { mode: "Caça-Estrelas", modeId: "bounty" },
  "brawl ball": { mode: "Fute-Brawl", modeId: "brawl-ball" },
  "brawlball": { mode: "Fute-Brawl", modeId: "brawl-ball" },
  "hot zone": { mode: "Zona Estratégica", modeId: "hot-zone" },
  "hotzone": { mode: "Zona Estratégica", modeId: "hot-zone" },
  "knockout": { mode: "Nocaute", modeId: "knockout" },
};

export type DiscoveredRankedMap = {
  name: string;
  /** Identificador oficial, usado em `/rankeds/<id>`. */
  id: string;
  mode?: string;
  modeId?: string;
  /** Slug provável no Brawl Planet, derivado do nome e do modo. */
  planetSlug?: string;
};

export type RankedRotationReading = {
  maps: DiscoveredRankedMap[];
  /**
   * A leitura é confiável ao ponto de poder provar ausências. Falso quando o
   * parser trouxe mapas a menos para o resultado ser plausível.
   */
  complete: boolean;
  note?: string;
};

/**
 * Menos do que isto e assume-se que foi o parser que partiu, não a rotação que
 * encolheu. A rotação Ranked anda à volta dos 26 mapas e nunca esteve perto de
 * uma dúzia; se um dia a Supercell a cortar mesmo para menos, o efeito é o
 * sistema manter os mapas antigos e assinalar a leitura como incompleta — visível
 * na interface, em vez de silenciosamente errado.
 */
export const MIN_PLAUSIBLE_MAPS = 12;

function stripTags(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O TopBrawl escreve o nome do mapa junto à ligação, por vezes precedido da
 * palavra "Map". Também aparece o modo colado ao nome em algumas vistas.
 */
/**
 * Nome do mapa a partir de um bloco de HTML, por ordem de confiança.
 *
 * "O primeiro texto do cartão" não chega: um cartão real tem emblemas, ícones e
 * estatísticas, e o primeiro texto pode ser qualquer um deles. Por isso
 * procura-se por ordem de quão específico é o sinal, e só se desce quando o
 * anterior não existe:
 *
 *  1. `alt="Map <nome>"` na miniatura. É o sinal mais forte e está mesmo na
 *     página: a ligação lê-se "Double Swoosh" + "Map Double Swoosh".
 *  2. O texto de um cabeçalho, ou de um elemento cuja classe fala em nome ou
 *     título — que é onde um nome costuma estar.
 *  3. Só então, o primeiro texto legível que sobreviva aos filtros.
 */
function mapNameFromBlock(bloco: string) {
  const limpo = bloco
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");

  const aceitavel = (texto: string) => {
    if (!texto || texto.length < 2 || texto.length > 60) return false;
    if (!/[a-zà-ÿ]/i.test(texto)) return false;
    if (/^\d[\d.,%\s]*$/.test(texto)) return false;
    if (/^(win|use|pick|ban|rate|score|jogos|battles|partidas)\b/i.test(texto)) return false;
    // Um rótulo de modo sozinho é o cabeçalho do grupo, não o mapa.
    return !Object.keys(MODE_BY_LABEL).some((label) => new RegExp(`^${label.replace(/ /g, "\\s*")}$`, "i").test(texto));
  };

  // 1. alt/title do tipo "Map <nome>".
  // A aspa de fecho tem de ser a mesma da abertura: "Belle's Rock" dentro de
  // aspas duplas parava no apóstrofo e devolvia "Belle".
  for (const match of limpo.matchAll(/(?:alt|title)\s*=\s*(["'])\s*map\s+((?:(?!\1)[^>]){2,60})\1/gi)) {
    const texto = cleanMapName(match[2] ?? "");
    if (aceitavel(texto)) return texto;
  }

  // 2. Cabeçalhos e elementos marcados como nome/título.
  for (const match of limpo.matchAll(/<(h[1-6])\b[^>]*>([\s\S]{0,200}?)<\/\1>/gi)) {
    const texto = cleanMapName(match[2] ?? "");
    if (aceitavel(texto)) return texto;
  }
  for (const match of limpo.matchAll(/<[a-z0-9]+\b[^>]*class\s*=\s*["'][^"']*(?:name|title|titulo|nome)[^"']*["'][^>]*>([\s\S]{0,200}?)</gi)) {
    const texto = cleanMapName(match[1] ?? "");
    if (aceitavel(texto)) return texto;
  }

  // 3. Último recurso: o primeiro texto legível.
  for (const pedaco of limpo.split(/<[^>]*>/)) {
    const texto = cleanMapName(pedaco);
    if (aceitavel(texto)) return texto;
  }
  return "";
}

function cleanMapName(raw: string) {
  let name = stripTags(raw);
  name = name.replace(/^map\s+/i, "");
  // Corta um rótulo de modo que venha agarrado ao nome.
  for (const label of Object.keys(MODE_BY_LABEL)) {
    const pattern = new RegExp(`\\s*[·|–—-]?\\s*${label.replace(/ /g, "\\s*")}\\s*$`, "i");
    name = name.replace(pattern, "");
  }
  return name.trim();
}

/** Slug do Brawl Planet a partir do nome e do modo, no formato `nomemapa_modo`. */
export function brawlPlanetSlug(name: string, modeId?: string) {
  const base = name.toLowerCase().replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "");
  const mode = modeId ? modeId.replace(/-/g, "") : "";
  return mode ? `${base}_${mode}` : base;
}

/**
 * Lê o índice de rankeds. Nunca lança: uma página estranha devolve uma leitura
 * incompleta, que os chamadores sabem tratar.
 */
export function parseRankedRotationIndex(html: string): RankedRotationReading {
  if (typeof html !== "string" || html.length < 200) {
    return { maps: [], complete: false, note: "Resposta vazia ou demasiado curta para ser o índice." };
  }

  const found = new Map<string, DiscoveredRankedMap>();

  /**
   * Cabeçalhos de modo aparecem antes do grupo de mapas a que pertencem. Guarda-se
   * a posição de cada um para depois atribuir a cada ligação o último que a
   * precede — é assim que o modo é inferido sem depender de classes CSS.
   */
  const modeMarkers: Array<{ index: number; mode: string; modeId: string }> = [];
  for (const [label, value] of Object.entries(MODE_BY_LABEL)) {
    const pattern = new RegExp(`>\\s*${label.replace(/ /g, "[\\s-]*")}\\s*<`, "gi");
    for (const match of html.matchAll(pattern)) {
      modeMarkers.push({ index: match.index ?? 0, mode: value.mode, modeId: value.modeId });
    }
  }
  modeMarkers.sort((left, right) => left.index - right.index);

  const modeAt = (index: number) => {
    let current: { mode: string; modeId: string } | undefined;
    for (const marker of modeMarkers) {
      if (marker.index > index) break;
      current = { mode: marker.mode, modeId: marker.modeId };
    }
    return current;
  };

  /**
   * Toda a ligação para `/rankeds/<id>`. O nome é procurado primeiro dentro da
   * própria ligação e, se lá não estiver, no texto imediatamente a seguir — as
   * duas formas que a página já usou.
   */
  const anchorPattern = /<a\b[^>]*href="[^"]*\/rankeds\/(\d+)[^"]*"[^>]*>([\s\S]{0,400}?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const id = match[1];
    const index = match.index ?? 0;
    /**
     * O nome é o PRIMEIRO texto legível da ligação, não todo o texto dela.
     *
     * Achatar o cartão inteiro dava "Win 52.4% Use 11.9% Double Swoosh" — com
     * mais de 60 caracteres, o mapa era descartado logo a seguir. Um cartão com
     * estatísticas lá dentro bastava para o mapa desaparecer sem erro nenhum.
     */
    let name = mapNameFromBlock(match[2] ?? "") || cleanMapName(match[2] ?? "");

    if (!name) {
      const after = html.slice(index + match[0].length, index + match[0].length + 200);
      name = cleanMapName(after.split("<")[0] ?? "");
    }
    if (!name || name.length > 60) continue;

    const mode = modeAt(index);
    // O mesmo mapa pode aparecer mais do que uma vez; fica o primeiro com nome.
    if (!found.has(id)) {
      found.set(id, {
        name,
        id,
        ...(mode ?? {}),
        planetSlug: brawlPlanetSlug(name, mode?.modeId),
      });
    }
  }

  /**
   * Segunda passagem, tolerante à marcação.
   *
   * A primeira exige um `<a href="…/rankeds/123">` com as aspas duplas e com o
   * nome dentro dos primeiros 400 caracteres do conteúdo. Um cartão de mapa com
   * imagem, ícone de modo e estatísticas lá dentro estoura esse limite — e a
   * leitura passou a devolver ZERO mapas de uma página de 168 KB que continha
   * as ligações todas. Zero mapas não dava erro: caía na rotação do projeto, em
   * silêncio.
   *
   * Esta passagem não olha para a estrutura. Procura a ligação onde quer que
   * esteja, com ou sem aspas, e vai buscar o primeiro pedaço de texto legível a
   * seguir — que é onde o nome do mapa está, seja qual for a marcação à volta.
   * Só preenche o que a primeira não apanhou, para nunca piorar uma leitura boa.
   */
  const loosePattern = /\/rankeds\/(\d+)/gi;
  for (const match of html.matchAll(loosePattern)) {
    const id = match[1];
    if (found.has(id)) continue;
    const index = match.index ?? 0;

    /**
     * A janela começa depois do `>` que fecha a etiqueta onde o endereço está.
     * A começar no próprio endereço, o primeiro "texto" encontrado seria o
     * resto dos atributos da etiqueta.
     */
    const fechoDaEtiqueta = html.indexOf(">", index);
    const inicio = fechoDaEtiqueta === -1 ? index : fechoDaEtiqueta + 1;
    const janela = html.slice(inicio, inicio + 1200);
    const name = mapNameFromBlock(janela);
    if (!name || name.length > 60) continue;

    const mode = modeAt(index);
    found.set(id, {
      name,
      id,
      ...(mode ?? {}),
      planetSlug: brawlPlanetSlug(name, mode?.modeId),
    });
  }

  const maps = Array.from(found.values()).sort((left, right) => left.name.localeCompare(right.name, "pt-PT"));
  const complete = maps.length >= MIN_PLAUSIBLE_MAPS;

  return {
    maps,
    complete,
    note: complete
      ? undefined
      : `Apenas ${maps.length} mapas reconhecidos no índice (mínimo plausível: ${MIN_PLAUSIBLE_MAPS}). A leitura não é usada para remover mapas.`,
  };
}

/**
 * Junta a rotação descoberta à lista do projeto.
 *
 * A lista estática deixa de ser a verdade e passa a ser a rede de segurança: dá
 * os ids conhecidos quando a descoberta falha, e fornece o slug do Brawl Planet
 * verificado à mão, que é mais fiável do que o derivado do nome.
 */
export function mergeRotationSources(
  fallback: ReadonlyArray<readonly [string, string, string]>,
  discovered: RankedRotationReading,
): { maps: DiscoveredRankedMap[]; complete: boolean; note?: string } {
  const staticByName = new Map(
    fallback.map(([name, id, slug]) => [name.trim().toLowerCase(), { name, id, planetSlug: slug }]),
  );

  if (!discovered.complete) {
    return {
      maps: fallback.map(([name, id, planetSlug]) => ({ name, id, planetSlug })),
      complete: false,
      note: discovered.note ?? "Índice indisponível; a usar a rotação incluída no projeto.",
    };
  }

  const maps = discovered.maps.map((map) => {
    const known = staticByName.get(map.name.trim().toLowerCase());
    return {
      ...map,
      // O id publicado manda: se a fonte mudar o id de um mapa, é esse o que funciona.
      id: map.id || known?.id || "",
      // Para o slug é o contrário: o verificado à mão ganha ao derivado.
      planetSlug: known?.planetSlug ?? map.planetSlug,
    };
  }).filter((map) => Boolean(map.id));

  return { maps, complete: true };
}
