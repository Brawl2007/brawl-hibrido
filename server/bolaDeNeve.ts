/**
 * A bola de neve: os jogadores que a recolha segue além dos rankings.
 *
 * POR QUE EXISTE
 *
 * A API só deixa ler jogador a jogador, e os rankings só têm os que têm mais
 * troféus — quase todos Lendário e Mestre, e muitos nem jogam Ranked. Cada
 * partida Ranked lida traz os códigos dos outros cinco jogadores; seguir esses
 * faz a lista crescer sozinha, para quem joga mesmo Ranked, em todos os elos.
 *
 * AS REGRAS
 *
 * - Só entra quem apareceu numa partida Ranked.
 * - Quem jogou Ranked desde a última leitura volta a ser lido antes de encher
 *   as 25 partidas que a API guarda (a espera mede-se pelo ritmo dele).
 * - Quem não jogou é lido cada vez menos: 1 h, 6 h, 1 dia, 3 dias.
 * - Sete dias sem Ranked, sai da lista. Se voltar a jogar, volta a entrar
 *   quando aparecer numa partida de outro.
 * - A lista tem um teto, e metade de cada recolha fica para os rankings.
 *
 * Este ficheiro só faz contas; ler e gravar fica em `db.ts` e na recolha.
 */

/** Quantos jogadores a lista pode ter. Mais do que isto ficava à espera sem ser lido. */
export const LIMITE_DA_LISTA = 50_000;

/** Quantos lugares de cada recolha vão para a lista (o resto é dos rankings). */
export const LUGARES_DA_BOLA_DE_NEVE = 60;

/** Sem partidas Ranked durante este tempo, o jogador sai da lista. */
export const TEMPO_SEM_RANKED_PARA_SAIR_MS = 7 * 24 * 3_600_000;

/** Esperas para quem não jogou Ranked desde a última leitura: 1 h, 6 h, 1 dia, 3 dias. */
export const ESPERAS_SEM_RANKED_MS = [3_600_000, 6 * 3_600_000, 24 * 3_600_000, 72 * 3_600_000] as const;

/** Limites da espera para quem está a jogar Ranked. */
export const ESPERA_MINIMA_MS = 15 * 60_000;
export const ESPERA_MAXIMA_MS = 6 * 3_600_000;

/** Quantas partidas a API guarda por jogador. */
const PARTIDAS_NO_HISTORICO = 25;

/**
 * Os códigos de jogador têm `#` e só estas letras e números. Um código fora
 * disto não é pedido à API.
 */
const TAG_VALIDA = /^#[0289PYLQGRJCUV]{3,14}$/;

export function normalizarTag(tag: string | undefined | null) {
  const limpa = (tag ?? "").trim().toUpperCase();
  const comCardinal = limpa.startsWith("#") ? limpa : `#${limpa}`;
  return TAG_VALIDA.test(comCardinal) ? comCardinal : null;
}

/** Uma partida do histórico, já lida: quando foi e se era Ranked. */
export type PartidaDoHistorico = { quando: Date; ranked: boolean };

export type EstadoDoJogador = {
  ultimaLeitura: Date | null;
  ultimaRanked: Date | null;
  leiturasVazias: number;
};

/**
 * Quando voltar a ler um jogador, pelo que se viu no histórico dele.
 *
 * Quem jogou Ranked desde a última leitura: mede-se quantas partidas (de
 * qualquer tipo) fez por hora e volta-se a ler quando tiver feito ~60% das 25
 * que a API guarda — assim nenhuma partida Ranked sai do histórico sem ser
 * vista. Quem não jogou: a espera cresce a cada leitura vazia.
 */
export function proximaLeitura(
  partidas: readonly PartidaDoHistorico[],
  anterior: EstadoDoJogador | undefined,
  agora = new Date(),
): { ultimaLeitura: Date; ultimaRanked: Date | null; leiturasVazias: number; proxima: Date; rankedNovas: number } {
  const desde = anterior?.ultimaLeitura?.getTime() ?? Number.NEGATIVE_INFINITY;
  const novas = partidas.filter((partida) => partida.quando.getTime() > desde);
  const rankedNovas = novas.filter((partida) => partida.ranked);
  const maisRecenteRanked = rankedNovas.reduce<number | null>(
    (maior, partida) => (maior === null || partida.quando.getTime() > maior ? partida.quando.getTime() : maior),
    null,
  );
  const ultimaRanked = maisRecenteRanked !== null
    ? new Date(Math.max(maisRecenteRanked, anterior?.ultimaRanked?.getTime() ?? 0))
    : anterior?.ultimaRanked ?? null;

  if (!rankedNovas.length) {
    const leiturasVazias = (anterior?.leiturasVazias ?? 0) + 1;
    const espera = ESPERAS_SEM_RANKED_MS[Math.min(leiturasVazias, ESPERAS_SEM_RANKED_MS.length) - 1];
    return { ultimaLeitura: agora, ultimaRanked, leiturasVazias, rankedNovas: 0, proxima: new Date(agora.getTime() + espera) };
  }

  // O ritmo: partidas novas no tempo que passou desde a última leitura (ou, na
  // primeira, desde a partida mais antiga do histórico).
  const inicio = Number.isFinite(desde) ? desde : Math.min(...novas.map((partida) => partida.quando.getTime()));
  const tempo = Math.max(agora.getTime() - inicio, 60_000);
  const porMs = novas.length / tempo;
  const espera = Math.min(ESPERA_MAXIMA_MS, Math.max(ESPERA_MINIMA_MS, (0.6 * PARTIDAS_NO_HISTORICO) / porMs));
  return { ultimaLeitura: agora, ultimaRanked, leiturasVazias: 0, rankedNovas: rankedNovas.length, proxima: new Date(agora.getTime() + espera) };
}

/**
 * Quem ler nesta recolha: primeiro os da lista que já estão na altura (até ao
 * número de lugares deles), depois os dos rankings. Se faltarem jogadores de
 * um lado, o outro ocupa os lugares — nenhuma leitura fica por fazer.
 */
export function escolherLeituras(
  dosRankings: readonly string[],
  daLista: readonly string[],
  total: number,
  lugaresDaLista = LUGARES_DA_BOLA_DE_NEVE,
) {
  const escolhidos: string[] = [];
  const vistos = new Set<string>();
  const juntar = (tag: string) => {
    const normal = normalizarTag(tag);
    if (!normal || vistos.has(normal) || escolhidos.length >= total) return false;
    vistos.add(normal);
    escolhidos.push(normal);
    return true;
  };
  let daListaUsados = 0;
  let resto = 0;
  for (; resto < daLista.length && daListaUsados < Math.min(lugaresDaLista, total); resto += 1) {
    if (juntar(daLista[resto])) daListaUsados += 1;
  }
  for (const tag of dosRankings) juntar(tag);
  // Rankings curtos (ou em falha): os lugares que sobram voltam para a lista.
  for (; resto < daLista.length && escolhidos.length < total; resto += 1) {
    if (juntar(daLista[resto])) daListaUsados += 1;
  }
  return { tags: escolhidos, daLista: daListaUsados, dosRankings: escolhidos.length - daListaUsados };
}
