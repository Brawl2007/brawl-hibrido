import { montarDadosDoMotorApi, type DadosApiParaMotor } from "./observedMatchupMatrix";
import { calcularWinRateBayesiano, calcularDeltaCounterPuro, calcularDeltaSinergiaPura, calcularDeltaSinergiaTripla, logit, sigmoid } from "./motorApiPerfeito";
/**
 * A ficha de um brawler a partir das partidas Ranked da API oficial — a Matriz
 * 1v1 com o botão «API» ligado.
 *
 * POR QUE EXISTE
 *
 * O BrawlScope mostra, para cada brawler, quem o countera, quem ele castiga e
 * com quem joga melhor, sempre como «taxa contra ele vs taxa habitual». Com as
 * partidas guardadas pelo site dá para fazer as mesmas contas, por modo, por
 * mapa, por rank e por período, e ainda os trios, que o BrawlScope não mostra.
 *
 * AS CONTAS
 *
 * - Confronto: a taxa de vitória do adversário quando enfrenta o brawler,
 *   comparada com a taxa habitual desse adversário. +10 quer dizer que o
 *   adversário ganha 10 pontos acima do normal contra ele: é um counter.
 *   Abaixo de zero, é o brawler que o castiga.
 * - Dupla e trio: a taxa de vitória da equipa com o brawler, comparada com a
 *   taxa habitual do próprio brawler.
 * - A ordem usa a diferença puxada para zero pelo número de jogos
 *   (`JOGOS_DE_PRIOR`, o mesmo do Draft): três jogos a 100% não passam à
 *   frente de trezentos a 60%. O número mostrado é o medido, sem ajuste.
 */
import { JOGOS_DE_PRIOR, fontesDeApoioDaApi } from "./counterMatchupValue";
import { nomeDoModo, type ResumoDasPartidas } from "./partidasObservadas";

/** Menos jogos do que isto não entra nos destaques (continua na lista completa). */
export const JOGOS_MINIMOS_PARA_DESTAQUE = 10;
const DESTAQUES = 10;

export type ConfrontoDaFicha = {
  adversario: string;
  jogos: number;
  /** Vitórias do adversário contra o brawler. */
  vitoriasDoAdversario: number;
  /** Taxa de vitória do adversário contra o brawler, em %. */
  taxa: number;
  /** Taxa de vitória habitual do adversário, em %. */
  habitual: number | null;
  /** `taxa - habitual`, em pontos. Positivo: o adversário countera o brawler. */
  delta: number | null;
  ajustado: number;
  /** Residual puro em log-odds, presente com metadados ponderados. */
  deltaLogit?: number;
};

export type EquipaDaFicha = {
  aliados: string[];
  jogos: number;
  vitorias: number;
  taxa: number;
  /** `taxa - taxa habitual do brawler`, em pontos. */
  delta: number | null;
  ajustado: number;
  /** Residual puro em log-odds, presente com metadados ponderados. */
  deltaLogit?: number;
};

export type ModoDaFicha = { mode: string; nome: string; jogos: number; vitorias: number; taxa: number; parteDosJogos: number };

export type FichaDaApi = {
  brawler: string;
  encontrado: boolean;
  partidas: number;
  jogos: number;
  vitorias: number;
  taxa: number | null;
  uso: number | null;
  confrontos: ConfrontoDaFicha[];
  duplas: EquipaDaFicha[];
  trios: EquipaDaFicha[];
  porModo: ModoDaFicha[];
  counters: ConfrontoDaFicha[];
  castiga: ConfrontoDaFicha[];
  melhoresDuplas: EquipaDaFicha[];
  melhoresTrios: EquipaDaFicha[];
};

const mesmoNome = (a: string, b: string) => a.toLocaleUpperCase("en") === b.toLocaleUpperCase("en");
const percentagem = (vitorias: number, jogos: number) => (jogos > 0 ? (vitorias / jogos) * 100 : 0);
const ajustar = (delta: number | null, jogos: number) => (delta === null ? 0 : (delta * jogos) / (jogos + JOGOS_DE_PRIOR));

function equipa(aliados: string[], jogos: number, vitorias: number, base: number | null): EquipaDaFicha {
  const taxa = percentagem(vitorias, jogos);
  const delta = base === null ? null : taxa - base;
  return { aliados, jogos, vitorias, taxa, delta, ajustado: ajustar(delta, jogos) };
}

/**
 * @param resumo as partidas do filtro escolhido (período, modo, mapa, rank)
 * @param porModo as contagens por modo do mesmo período e rank, sem modo nem mapa
 */
export function fichaDoBrawler(
  resumo: Pick<ResumoDasPartidas, "partidas" | "brawlers" | "confrontos" | "sinergias" | "equipas"> & Partial<Pick<ResumoDasPartidas, "partidasPonderadas">>,
  nome: string,
  porModo: ResumoDasPartidas["brawlersPorModo"] = {},
  priorModo?: DadosApiParaMotor["priorModo"],
  modeId?: string,
): FichaDaApi {
  const modelo = resumo.partidasPonderadas !== undefined ? montarDadosDoMotorApi(resumo.brawlers.map((l) => l.brawler), { ...resumo, priorModo }, fontesDeApoioDaApi(modeId)) : undefined;
  const beta = (n: string) => modelo?.estatisticasMapa[n] ? logit(calcularWinRateBayesiano(modelo.estatisticasMapa[n])) : 0;
  const proprio = resumo.brawlers.find((linha) => mesmoNome(linha.brawler, nome));
  const brawler = proprio?.brawler ?? nome;
  const habitual = new Map(resumo.brawlers.map((linha) => [linha.brawler, percentagem(linha.vitorias, linha.jogos)]));
  const base = proprio && proprio.jogos > 0 ? percentagem(proprio.vitorias, proprio.jogos) : null;

  const confrontos: ConfrontoDaFicha[] = resumo.confrontos
    .filter((linha) => mesmoNome(linha.b, brawler) && !mesmoNome(linha.a, brawler))
    .map((linha) => {
      const taxa = percentagem(linha.vitorias, linha.jogos);
      const doAdversario = habitual.get(linha.a) ?? null;
      const puro = modelo ? calcularDeltaCounterPuro(beta(linha.a), beta(brawler), modelo.obterConfronto(linha.a, brawler), modelo.obterCounterDeReserva?.(linha.a, brawler)) : null;
      const delta = puro === null ? doAdversario === null ? null : taxa - doAdversario : (sigmoid(puro) - .5) * 100;
      return { adversario: linha.a, jogos: linha.jogos, vitoriasDoAdversario: linha.vitorias, taxa, habitual: doAdversario, delta, deltaLogit: puro ?? undefined, ajustado: puro ?? ajustar(delta, linha.jogos) };
    })
    .sort((x, y) => y.ajustado - x.ajustado || y.jogos - x.jogos);

  const equipaPonderada = (aliados: string[], jogos: number, vitorias: number) => {
    const linha = equipa(aliados, jogos, vitorias, base);
    if (!modelo) return linha;
    const deltas = aliados.map((a) => calcularDeltaSinergiaPura(beta(brawler), beta(a), modelo.obterSinergia(brawler, a), modelo.obterSinergiaDeReserva?.(brawler, a)));
    let puro = deltas.reduce((a, b) => a + b, 0);
    if (aliados.length === 2) puro += calcularDeltaSinergiaTripla([beta(brawler), ...aliados.map(beta)], [...deltas, calcularDeltaSinergiaPura(beta(aliados[0]), beta(aliados[1]), modelo.obterSinergia(aliados[0], aliados[1]), modelo.obterSinergiaDeReserva?.(aliados[0], aliados[1]))], modelo.obterTrio([brawler, ...aliados]));
    return { ...linha, delta: (sigmoid(puro) - .5) * 100, ajustado: puro, deltaLogit: puro };
  };
  const duplas = resumo.sinergias
    .filter((linha) => mesmoNome(linha.a, brawler) || mesmoNome(linha.b, brawler))
    .map((linha) => equipaPonderada([mesmoNome(linha.a, brawler) ? linha.b : linha.a], linha.jogos, linha.vitorias))
    .sort((x, y) => y.ajustado - x.ajustado || y.jogos - x.jogos);

  const trios = resumo.equipas
    .filter((linha) => linha.membros.length === 3 && linha.membros.some((membro) => mesmoNome(membro, brawler)))
    .map((linha) => equipaPonderada(linha.membros.filter((membro) => !mesmoNome(membro, brawler)), linha.jogos, linha.vitorias))
    .sort((x, y) => y.ajustado - x.ajustado || y.jogos - x.jogos);

  const modos = Object.entries(porModo)
    .map(([mode, lista]) => ({ mode, linha: lista.find((linha) => mesmoNome(linha.brawler, brawler)) }))
    .filter((entrada): entrada is { mode: string; linha: NonNullable<typeof entrada.linha> } => Boolean(entrada.linha));
  const jogosEmTodosOsModos = modos.reduce((total, entrada) => total + entrada.linha.jogos, 0);

  const comAmostra = <T extends { jogos: number }>(lista: T[]) => lista.filter((linha) => linha.jogos >= JOGOS_MINIMOS_PARA_DESTAQUE);
  return {
    brawler,
    encontrado: Boolean(proprio),
    partidas: resumo.partidas,
    jogos: proprio?.jogos ?? 0,
    vitorias: proprio?.vitorias ?? 0,
    taxa: base,
    uso: proprio && resumo.partidas > 0 ? (proprio.jogos / resumo.partidas) * 100 : null,
    confrontos,
    duplas,
    trios,
    porModo: modos
      .map(({ mode, linha }) => ({
        mode,
        nome: nomeDoModo(mode),
        jogos: linha.jogos,
        vitorias: linha.vitorias,
        taxa: percentagem(linha.vitorias, linha.jogos),
        parteDosJogos: jogosEmTodosOsModos > 0 ? (linha.jogos / jogosEmTodosOsModos) * 100 : 0,
      }))
      .sort((x, y) => y.taxa - x.taxa),
    counters: comAmostra(confrontos).filter((linha) => (linha.delta ?? 0) > 0).slice(0, DESTAQUES),
    castiga: comAmostra(confrontos).filter((linha) => (linha.delta ?? 0) < 0).reverse().slice(0, DESTAQUES),
    melhoresDuplas: comAmostra(duplas).filter((linha) => (linha.delta ?? 0) > 0).slice(0, DESTAQUES),
    melhoresTrios: comAmostra(trios).filter((linha) => (linha.delta ?? 0) > 0).slice(0, DESTAQUES),
  };
}
