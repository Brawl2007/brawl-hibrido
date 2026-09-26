/**
 * Os números do Brawl Planet separados por elo: All ranks, Diamond, Mythic e
 * Legendary.
 *
 * DE ONDE VÊM
 *
 * A página de cada mapa só traz "All ranks" no HTML. Ao escolher um elo, o
 * próprio site do Brawl Planet descarrega um ficheiro público por elo, com
 * TODOS os mapas de uma vez, do armazenamento público da Google:
 *
 *     storage.googleapis.com/brawlanalyzer-public/pl-results.json.gz     All ranks
 *     storage.googleapis.com/brawlanalyzer-public/pl-d1-results.json.gz  Diamond
 *     storage.googleapis.com/brawlanalyzer-public/pl-m1-results.json.gz  Mythic
 *     storage.googleapis.com/brawlanalyzer-public/pl-l1-results.json.gz  Legendary
 *
 * São os mesmos ficheiros que qualquer visitante descarrega, atualizados de
 * hora a hora. Quatro pedidos por recolha, em vez de um por mapa.
 *
 * Verificado antes de usar: o "All ranks" deste ficheiro coincide com o que o
 * site já lia do HTML de cada mapa (2756 linhas: diferença mediana 0,00; 95%
 * até 0,2 pontos — a diferença é a hora de leitura, o Brawl Planet atualiza de
 * hora a hora).
 *
 * CADA ELO É MEDIDO À PARTE
 *
 * Nas palavras deles: "each rank is measured on its own, not pooled with the
 * ranks above it". E há mapas sem jogos suficientes num elo — aí o ficheiro não
 * traz o mapa, e o site mantém "All ranks" nesse mapa e diz porquê.
 *
 * O TopBrawl não separa por elo. Escolher um elo muda só a parte do Brawl
 * Planet da mistura.
 */

export type EloBrawlPlanet = "all" | "d1" | "m1" | "l1";
export type EloSeparado = Exclude<EloBrawlPlanet, "all">;

export const ELOS_BRAWL_PLANET: ReadonlyArray<{ id: EloBrawlPlanet; nome: string; ficheiro: string }> = [
  { id: "all", nome: "All ranks", ficheiro: "pl" },
  { id: "d1", nome: "Diamond", ficheiro: "pl-d1" },
  { id: "m1", nome: "Mythic", ficheiro: "pl-m1" },
  { id: "l1", nome: "Legendary", ficheiro: "pl-l1" },
];
export const ELOS_SEPARADOS: readonly EloSeparado[] = ["d1", "m1", "l1"];

export function enderecoDoElo(ficheiro: string) {
  return `https://storage.googleapis.com/brawlanalyzer-public/${ficheiro}-results.json.gz`;
}

export function eloValido(valor: unknown): valor is EloBrawlPlanet {
  return valor === "all" || valor === "d1" || valor === "m1" || valor === "l1";
}

/** [vitória, uso, star player] de um brawler num elo. Em lista para a snapshot não crescer muito. */
export type NumerosDoElo = [number | null, number | null, number | null];
export type PorElo = Partial<Record<EloSeparado, NumerosDoElo>>;

/** O que a snapshot guarda sobre os elos, além das linhas. */
export type ElosNaSnapshot = {
  lidoEm: string | null;
  /** Jogos publicados por mapa e elo. Um mapa sem entrada num elo não tem dados nesse elo. */
  jogos: Record<string, Partial<Record<EloBrawlPlanet, number>>>;
  /** Que ficheiros foram lidos. Um elo que falhou não é o mesmo que um elo sem jogos. */
  lidos: EloBrawlPlanet[];
};

type EntradaDoFicheiro = {
  map?: unknown;
  match_count?: unknown;
  individual?: Array<{ brawler?: unknown; wr?: unknown; ur?: unknown; sr?: unknown }>;
};

const numero = (valor: unknown) => (typeof valor === "number" && Number.isFinite(valor) ? valor : null);

/**
 * Lê os ficheiros de elo para os mapas da rotação.
 *
 * `slugs` liga o slug do Brawl Planet (o mesmo da página, ex. `bellesrock_knockout`)
 * ao nome do mapa no site. `nomeCanonico` põe "WENDY" como "Wendy", "LARRY &
 * LAWRIE" como "Larry & Lawrie" — o mesmo que a leitura do HTML faz.
 */
export function lerElosDoBrawlPlanet(
  ficheiros: Partial<Record<EloBrawlPlanet, unknown>>,
  slugs: ReadonlyMap<string, string>,
  nomeCanonico: (mapa: string, bruto: string) => string,
): { porLinha: Map<string, { todos?: NumerosDoElo; porElo: PorElo }>; jogos: ElosNaSnapshot["jogos"]; lidos: EloBrawlPlanet[] } {
  const porLinha = new Map<string, { todos?: NumerosDoElo; porElo: PorElo }>();
  const jogos: ElosNaSnapshot["jogos"] = {};
  const lidos: EloBrawlPlanet[] = [];
  for (const { id } of ELOS_BRAWL_PLANET) {
    const ficheiro = ficheiros[id];
    if (!ficheiro || typeof ficheiro !== "object") continue;
    lidos.push(id);
    for (const [slug, mapa] of Array.from(slugs.entries())) {
      const entrada = (ficheiro as Record<string, EntradaDoFicheiro>)[slug];
      if (!entrada || !Array.isArray(entrada.individual) || entrada.individual.length === 0) continue;
      const nJogos = numero(entrada.match_count);
      (jogos[mapa] ??= {})[id] = nJogos ?? 0;
      for (const linha of entrada.individual) {
        if (typeof linha?.brawler !== "string" || !linha.brawler.trim()) continue;
        const brawler = nomeCanonico(mapa, linha.brawler.trim());
        const numeros: NumerosDoElo = [numero(linha.wr), numero(linha.ur), numero(linha.sr)];
        const atual = porLinha.get(`${mapa}::${brawler}`) ?? { porElo: {} };
        if (id === "all") atual.todos = numeros;
        else atual.porElo[id] = numeros;
        porLinha.set(`${mapa}::${brawler}`, atual);
      }
    }
  }
  return { porLinha, jogos, lidos };
}

type LinhaComPlanet = {
  map: string;
  winRate?: number | null;
  usage?: number | null;
  topBrawlWinRate?: number | null;
  topBrawlUseRate?: number | null;
  brawlPlanetWinRate?: number | null;
  brawlPlanetPickRate?: number | null;
  brawlPlanetStarPlayer?: number | null;
  brawlPlanetPorElo?: PorElo;
};

/** Um mapa tem dados num elo quando o ficheiro desse elo o trouxe. */
export function mapaTemElo(elos: ElosNaSnapshot | undefined, mapa: string, elo: EloBrawlPlanet) {
  if (elo === "all") return true;
  return typeof elos?.jogos?.[mapa]?.[elo] === "number";
}

/**
 * Troca os números do Brawl Planet pelos do elo escolhido.
 *
 * "All ranks" devolve as MESMAS linhas, sem copiar nada: é o que o site sempre
 * mostrou, e tem de continuar igual ao byte.
 *
 * Num mapa com dados no elo, todos os brawlers desse mapa passam para o elo; um
 * brawler que o elo não traz fica sem números do Brawl Planet (e o TopBrawl, se
 * tiver, carrega a linha sozinho). Misturar All ranks e Diamond no mesmo mapa
 * compararia brawlers medidos em amostras diferentes.
 *
 * Num mapa sem dados no elo, fica All ranks — e o mapa aparece em `semDados`
 * para o ecrã o dizer.
 */
export function aplicarElo<T extends LinhaComPlanet>(
  linhas: readonly T[],
  elo: EloBrawlPlanet,
  elos: ElosNaSnapshot | undefined,
): { linhas: readonly T[]; semDados: string[] } {
  if (elo === "all") return { linhas, semDados: [] };
  const semDados = new Set<string>();
  const novas = linhas.map((linha) => {
    if (!mapaTemElo(elos, linha.map, elo)) {
      semDados.add(linha.map);
      return linha;
    }
    const [vitoria, uso, star] = linha.brawlPlanetPorElo?.[elo] ?? [null, null, null];
    const topVitoria = numero(linha.topBrawlWinRate);
    const topUso = numero(linha.topBrawlUseRate);
    const usos = [topUso, uso].filter((valor): valor is number => valor !== null);
    return {
      ...linha,
      brawlPlanetWinRate: vitoria,
      brawlPlanetPickRate: uso,
      brawlPlanetStarPlayer: star,
      // Os campos juntos da snapshot foram feitos com All ranks. Refeitos aqui
      // com a mesma regra da recolha, para nenhum número de outro elo escapar
      // por eles quando as duas fontes faltam.
      winRate: vitoria ?? topVitoria,
      usage: usos.length ? usos.reduce((soma, valor) => soma + valor, 0) / usos.length : null,
    };
  });
  return { linhas: novas, semDados: Array.from(semDados).sort() };
}

