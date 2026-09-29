/**
 * Os ranks do modo Ranked, pelo nível que a API dá a cada jogador.
 *
 * Numa partida Ranked (`soloRanked`/`teamRanked`), o campo `trophies` do
 * brawler de cada jogador não são troféus: é o nível do rank, de 1 (Bronze I)
 * para cima, três níveis por rank — Bronze 1–3, Prata 4–6, Ouro 7–9,
 * Diamante 10–12, Mítico 13–15, Lendário 16–18, Mestre 19–21, Pro 22.
 *
 * A correspondência NÃO vem documentada pela Supercell. É a convenção das
 * ferramentas da comunidade e é confirmada com os dados: a recolha devolve a
 * distribuição dos níveis vistos (`niveisVistos`), e um nível acima de 22
 * numa partida Ranked quer dizer que a convenção mudou — nesse caso a partida
 * fica sem rank em vez de ser arrumada no sítio errado.
 */
export const NIVEL_MAXIMO_DO_RANKED = 22;

export const RANKS_DO_FILTRO = [
  { id: "diamante", nome: "Diamante", min: 10, max: 12 },
  { id: "mitico", nome: "Mítico", min: 13, max: 15 },
  { id: "lendario", nome: "Lendário", min: 16, max: 18 },
  { id: "mestre", nome: "Mestre+", min: 19, max: NIVEL_MAXIMO_DO_RANKED },
] as const;

export type IdDoRank = (typeof RANKS_DO_FILTRO)[number]["id"];

export function intervaloDoRank(id: string | undefined) {
  return RANKS_DO_FILTRO.find((rank) => rank.id === id);
}

/** Mínimo, máximo e média (arredondada) dos níveis dos jogadores, ou null se algum não servir. */
export function rankDaPartida(niveis: ReadonlyArray<number | undefined>) {
  const validos = niveis.filter((nivel): nivel is number => typeof nivel === "number" && Number.isInteger(nivel));
  if (!validos.length || validos.length !== niveis.length) return null;
  if (validos.some((nivel) => nivel < 1 || nivel > NIVEL_MAXIMO_DO_RANKED)) return null;
  return {
    min: Math.min(...validos),
    max: Math.max(...validos),
    medio: Math.round(validos.reduce((soma, nivel) => soma + nivel, 0) / validos.length),
  };
}
