import { criarResumoDasPartidas, type PartidaObservada } from "@shared/partidasObservadas";

/**
 * As três partidas de teste, para ver a página «Partidas» em desenvolvimento.
 *
 * São as mesmas de `server/partidasObservadas.test.ts`: Bull, Colette e Lumi
 * ganham duas e perdem uma contra Surge, Emz e Griff/Gus. Servem para rever a
 * página sem uma base de dados — e SÓ isso: em produção, ou com
 * `DATABASE_URL` definido, nunca aparecem. A página marca-as como "de teste".
 */
export const MAPA_DAS_PARTIDAS_DE_EXEMPLO = "15000350";

const partida = (vencedores: string[], derrotados: string[]): PartidaObservada => ({ mapId: MAPA_DAS_PARTIDAS_DE_EXEMPLO, mode: "hotzone", vencedores, derrotados });

export const PARTIDAS_DE_EXEMPLO: readonly PartidaObservada[] = [
  partida(["Bull", "Colette", "Lumi"], ["Surge", "Emz", "Griff"]),
  partida(["Surge", "Emz", "Griff"], ["Bull", "Colette", "Lumi"]),
  partida(["Lumi", "Bull", "Colette"], ["Surge", "Emz", "Gus"]),
];

export function usarPartidasDeExemplo(ambiente: NodeJS.ProcessEnv = process.env) {
  return ambiente.NODE_ENV === "development" && !ambiente.DATABASE_URL;
}

/** O resumo das partidas de teste que passam o filtro (o rank não se aplica: não têm elo). */
export function resumirPartidasDeExemplo(filtro: { mode?: string; mapId?: string; rank?: string }) {
  const escolhidas = PARTIDAS_DE_EXEMPLO.filter((p) => (!filtro.mode || p.mode === filtro.mode) && (!filtro.mapId || p.mapId === filtro.mapId) && !filtro.rank);
  const acumulador = criarResumoDasPartidas({ ponderar: true });
  acumulador.acrescentar(escolhidas);
  const porMapa = escolhidas.length ? [{ mapId: MAPA_DAS_PARTIDAS_DE_EXEMPLO, mode: "hotzone", partidas: escolhidas.length }] : [];
  return { porMapa, nomesGuardados: { [MAPA_DAS_PARTIDAS_DE_EXEMPLO]: "Mapa dos jogos de teste" }, resumo: acumulador.terminar() };
}
