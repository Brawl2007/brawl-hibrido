/**
 * As contas da página «Partidas», a partir dos jogos Ranked recolhidos da API.
 *
 * POR QUE EXISTE
 *
 * A recolha guarda cada partida inteira: mapa, modo, as três escolhas de quem
 * ganhou e as três de quem perdeu. Daqui sai tudo o que a página mostra, sem
 * cortes — cada brawler, cada confronto 1 contra 1, cada equipa de três e cada
 * par de aliados, com o número de jogos ao lado para se ver o que é amostra a
 * sério e o que é acaso.
 *
 * Fica em `shared/` para ser testada sem base de dados: recebe partidas,
 * devolve contagens. A taxa de vitória calcula-se no ecrã (vitórias / jogos).
 */

export type PartidaObservada = {
  mapId: string;
  mode: string;
  vencedores: readonly string[];
  derrotados: readonly string[];
};

export type ContagemDeBrawler = { brawler: string; jogos: number; vitorias: number };
/** `a` contra `b`: jogos em que se enfrentaram e quantos `a` ganhou. */
export type ContagemDeConfronto = { a: string; b: string; jogos: number; vitorias: number };
export type ContagemDeEquipa = { membros: string[]; jogos: number; vitorias: number };
/** `a` e `b` na mesma equipa, com `a` < `b` por ordem alfabética. */
export type ContagemDeSinergia = { a: string; b: string; jogos: number; vitorias: number };

export type ResumoDasPartidas = {
  partidas: number;
  brawlers: ContagemDeBrawler[];
  /** Os mesmos números de `brawlers`, separados por modo (para «onde ganha»). */
  brawlersPorModo: Record<string, ContagemDeBrawler[]>;
  /** E separados por mapa, pelo número do mapa (para a secção Mapas com a API ligada). */
  brawlersPorMapa: Record<string, ContagemDeBrawler[]>;
  confrontos: ContagemDeConfronto[];
  equipas: ContagemDeEquipa[];
  sinergias: ContagemDeSinergia[];
};

/** Abaixo disto, a página avisa que a percentagem ainda é pouco fiável. */
export const JOGOS_MINIMOS_FIAVEIS = 30;

function somar<T extends { jogos: number; vitorias: number }>(mapa: Map<string, T>, chave: string, criar: () => T, ganhou: boolean) {
  let atual = mapa.get(chave);
  if (!atual) {
    atual = criar();
    mapa.set(chave, atual);
  }
  atual.jogos += 1;
  if (ganhou) atual.vitorias += 1;
}

export function resumirPartidas(partidas: readonly PartidaObservada[]): ResumoDasPartidas {
  const brawlers = new Map<string, ContagemDeBrawler>();
  const confrontos = new Map<string, ContagemDeConfronto>();
  const equipas = new Map<string, ContagemDeEquipa>();
  const sinergias = new Map<string, ContagemDeSinergia>();
  const porModo = new Map<string, Map<string, ContagemDeBrawler>>();
  const porMapa = new Map<string, Map<string, ContagemDeBrawler>>();
  const grupo = (onde: Map<string, Map<string, ContagemDeBrawler>>, chave: string) => {
    let lista = onde.get(chave);
    if (!lista) {
      lista = new Map();
      onde.set(chave, lista);
    }
    return lista;
  };

  for (const partida of partidas) {
    const doModo = grupo(porModo, partida.mode);
    const doMapa = grupo(porMapa, partida.mapId);
    for (const [equipa, adversarios, ganhou] of [
      [partida.vencedores, partida.derrotados, true],
      [partida.derrotados, partida.vencedores, false],
    ] as const) {
      const membros = Array.from(new Set(equipa)).sort();
      for (const brawler of membros) {
        somar(brawlers, brawler, () => ({ brawler, jogos: 0, vitorias: 0 }), ganhou);
        somar(doModo, brawler, () => ({ brawler, jogos: 0, vitorias: 0 }), ganhou);
        somar(doMapa, brawler, () => ({ brawler, jogos: 0, vitorias: 0 }), ganhou);
        for (const adversario of new Set(adversarios)) {
          if (adversario === brawler) continue;
          somar(confrontos, `${brawler}\u0000${adversario}`, () => ({ a: brawler, b: adversario, jogos: 0, vitorias: 0 }), ganhou);
        }
      }
      for (let i = 0; i < membros.length; i += 1) {
        for (let j = i + 1; j < membros.length; j += 1) {
          somar(sinergias, `${membros[i]}\u0000${membros[j]}`, () => ({ a: membros[i], b: membros[j], jogos: 0, vitorias: 0 }), ganhou);
        }
      }
      if (membros.length) somar(equipas, membros.join("\u0000"), () => ({ membros, jogos: 0, vitorias: 0 }), ganhou);
    }
  }

  const porJogos = <T extends { jogos: number; vitorias: number }>(lista: T[]) =>
    lista.sort((x, y) => y.jogos - x.jogos || y.vitorias - x.vitorias);
  return {
    partidas: partidas.length,
    brawlers: porJogos(Array.from(brawlers.values())),
    brawlersPorModo: Object.fromEntries(Array.from(porModo, ([modo, lista]) => [modo, porJogos(Array.from(lista.values()))])),
    brawlersPorMapa: Object.fromEntries(Array.from(porMapa, ([mapa, lista]) => [mapa, porJogos(Array.from(lista.values()))])),
    confrontos: porJogos(Array.from(confrontos.values())),
    equipas: porJogos(Array.from(equipas.values())),
    sinergias: porJogos(Array.from(sinergias.values())),
  };
}

/** Taxa de vitória em percentagem, ou null sem jogos. */
export function taxaDeVitoria(contagem: { jogos: number; vitorias: number }) {
  return contagem.jogos > 0 ? (contagem.vitorias / contagem.jogos) * 100 : null;
}

/**
 * Taxa de uso: em quantas partidas o brawler apareceu, em percentagem. Cada
 * partida tem duas equipas, por isso um brawler aparece no máximo uma vez por
 * equipa — a conta é por partida, não por escolha.
 */
export function taxaDeUso(jogos: number, partidas: number) {
  return partidas > 0 ? (jogos / partidas) * 100 : null;
}

/** Nomes dos modos como o site os escreve, a partir do nome normalizado da API. */
export const NOMES_DOS_MODOS: Record<string, string> = {
  gemgrab: "Pique-Gema",
  brawlball: "Fute-Brawl",
  heist: "Roubo",
  bounty: "Caça-Estrelas",
  hotzone: "Zona Estratégica",
  knockout: "Nocaute",
  wipeout: "Eliminação",
  basketbrawl: "Basket-Brawl",
};

export function nomeDoModo(mode: string) {
  return NOMES_DOS_MODOS[mode] ?? mode;
}
