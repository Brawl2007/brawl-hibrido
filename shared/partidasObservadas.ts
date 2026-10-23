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

import { calcularPesoPartidaObservada } from "./idadeDosDados";

export type PartidaObservada = {
  mapId: string;
  mode: string;
  vencedores: readonly string[];
  derrotados: readonly string[];
  battleTimeIso?: string;
  eloMedioRank?: "mitico" | "lendario" | "mestre" | "abaixo";
  todosNivel11?: boolean;
};

export type ContagemPonderada = { jogosPonderados?: number; vitoriasPonderadas?: number };

export type ContagemDeBrawler = ContagemPonderada & { brawler: string; jogos: number; vitorias: number };
/** `a` contra `b`: jogos em que se enfrentaram e quantos `a` ganhou. */
export type ContagemDeConfronto = ContagemPonderada & { a: string; b: string; jogos: number; vitorias: number };
export type ContagemDeEquipa = ContagemPonderada & { membros: string[]; jogos: number; vitorias: number };
/** `a` e `b` na mesma equipa, com `a` < `b` por ordem alfabética. */
export type ContagemDeSinergia = ContagemPonderada & { a: string; b: string; jogos: number; vitorias: number };

export type ResumoDasPartidas = {
  partidas: number;
  partidasPonderadas?: number;
  partidasPonderadasPorMapa?: Record<string, number>;
  confrontosPorModo?: Record<string, ContagemDeConfronto[]>;
  sinergiasPorModo?: Record<string, ContagemDeSinergia[]>;
  equipasPorModo?: Record<string, ContagemDeEquipa[]>;
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

function somar<T extends ContagemPonderada & { jogos: number; vitorias: number }>(mapa: Map<string, T>, chave: string, criar: () => T, ganhou: boolean, peso?: number) {
  let atual = mapa.get(chave);
  if (!atual) {
    atual = criar();
    mapa.set(chave, atual);
  }
  if (peso !== undefined) {
    atual.jogosPonderados = (atual.jogosPonderados ?? 0) + peso;
    atual.vitoriasPonderadas = (atual.vitoriasPonderadas ?? 0) + (ganhou ? peso : 0);
  }
  atual.jogos += 1;
  if (ganhou) atual.vitorias += 1;
}

export function criarResumoDasPartidas(opcoes: { ponderar?: boolean; agoraMs?: number } = {}) {
  const agoraMs = opcoes.agoraMs ?? Date.now();
  let totalPonderado = 0;
  const partidasPonderadasPorMapa: Record<string, number> = {};
  const confrontosPorModo = new Map<string, Map<string, ContagemDeConfronto>>();
  const sinergiasPorModo = new Map<string, Map<string, ContagemDeSinergia>>();
  const equipasPorModo = new Map<string, Map<string, ContagemDeEquipa>>();
  const paresDoModo = <T,>(onde: Map<string, Map<string, T>>, modo: string) => {
    if (!onde.has(modo)) onde.set(modo, new Map());
    return onde.get(modo)!;
  };
  let total = 0;
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

  function acrescentar(partidas: readonly PartidaObservada[]) {
    for (const partida of partidas) {
      total += 1;
      const peso = opcoes.ponderar ? calcularPesoPartidaObservada({
        battleTimeIso: partida.battleTimeIso ?? "",
        eloMedioRank: partida.eloMedioRank ?? "abaixo",
        todosNivel11: partida.todosNivel11 === true,
      }, agoraMs) : undefined;
      totalPonderado += peso ?? 0;
      partidasPonderadasPorMapa[partida.mapId] = (partidasPonderadasPorMapa[partida.mapId] ?? 0) + (peso ?? 0);
      const doModo = grupo(porModo, partida.mode);
      const doMapa = grupo(porMapa, partida.mapId);
      for (const [equipa, adversarios, ganhou] of [
        [partida.vencedores, partida.derrotados, true],
        [partida.derrotados, partida.vencedores, false],
      ] as const) {
        const membros = Array.from(new Set(equipa)).sort();
        for (const brawler of membros) {
          somar(brawlers, brawler, () => ({ brawler, jogos: 0, vitorias: 0 }), ganhou, peso);
          somar(doModo, brawler, () => ({ brawler, jogos: 0, vitorias: 0 }), ganhou, peso);
          somar(doMapa, brawler, () => ({ brawler, jogos: 0, vitorias: 0 }), ganhou, peso);
          for (const adversario of new Set(adversarios)) {
            if (adversario === brawler) continue;
            somar(confrontos, `${brawler}\u0000${adversario}`, () => ({ a: brawler, b: adversario, jogos: 0, vitorias: 0 }), ganhou, peso);
            if (opcoes.ponderar) somar(paresDoModo(confrontosPorModo, partida.mode), `${brawler}\u0000${adversario}`, () => ({ a: brawler, b: adversario, jogos: 0, vitorias: 0 }), ganhou, peso);
          }
        }
        for (let i = 0; i < membros.length; i += 1) {
          for (let j = i + 1; j < membros.length; j += 1) {
            somar(sinergias, `${membros[i]}\u0000${membros[j]}`, () => ({ a: membros[i], b: membros[j], jogos: 0, vitorias: 0 }), ganhou, peso);
            if (opcoes.ponderar) somar(paresDoModo(sinergiasPorModo, partida.mode), `${membros[i]}\u0000${membros[j]}`, () => ({ a: membros[i], b: membros[j], jogos: 0, vitorias: 0 }), ganhou, peso);
          }
        }
        if (membros.length) somar(equipas, membros.join("\u0000"), () => ({ membros, jogos: 0, vitorias: 0 }), ganhou, peso);
        if (opcoes.ponderar && membros.length) somar(paresDoModo(equipasPorModo, partida.mode), membros.join("\u0000"), () => ({ membros, jogos: 0, vitorias: 0 }), ganhou, peso);
      }
    }

  }

  function terminar(): ResumoDasPartidas {
    const porJogos = <T extends { jogos: number; vitorias: number }>(lista: T[]) =>
      lista.sort((x, y) => y.jogos - x.jogos || y.vitorias - x.vitorias);
    return {
      partidas: total,
      ...(opcoes.ponderar ? {
        partidasPonderadas: totalPonderado,
        partidasPonderadasPorMapa,
        confrontosPorModo: Object.fromEntries([...confrontosPorModo].map(([modo, lista]) => [modo, [...lista.values()]])),
        sinergiasPorModo: Object.fromEntries([...sinergiasPorModo].map(([modo, lista]) => [modo, [...lista.values()]])),
        equipasPorModo: Object.fromEntries([...equipasPorModo].map(([modo, lista]) => [modo, [...lista.values()]])),
      } : {}),
      brawlers: porJogos(Array.from(brawlers.values())),
      brawlersPorModo: Object.fromEntries(Array.from(porModo, ([modo, lista]) => [modo, porJogos(Array.from(lista.values()))])),
      brawlersPorMapa: Object.fromEntries(Array.from(porMapa, ([mapa, lista]) => [mapa, porJogos(Array.from(lista.values()))])),
      confrontos: porJogos(Array.from(confrontos.values())),
      equipas: porJogos(Array.from(equipas.values())),
      sinergias: porJogos(Array.from(sinergias.values())),
    };
  }
  return { acrescentar, terminar };
}

export function resumirPartidas(partidas: readonly PartidaObservada[]): ResumoDasPartidas {
  const resumo = criarResumoDasPartidas();
  resumo.acrescentar(partidas);
  return resumo.terminar();
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

