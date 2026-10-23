import { allRankedRows } from "../../client/src/data/rankedData";
import { criarReferenciasDoMapa } from "../../shared/adequacaoAoMapa";
import { montarDadosDoMotorApi } from "../../shared/observedMatchupMatrix";
import { perfisTaticosDoDraft } from "../../shared/draft";

/** Catálogo real do projeto; a amostra da API vazia isola os priors do mapa. */
export function mapaApiDoCatalogo(nome: string) {
  const rows = allRankedRows.filter(r => r.map === nome);
  const nomes = rows.map(r => r.brawler);
  const perfis = perfisTaticosDoDraft(nomes);
  const referenciasMapa = criarReferenciasDoMapa(rows, perfis, nome);
  const dados = montarDadosDoMotorApi(nomes, {
    partidas: 0,
    partidasPonderadas: 0,
    brawlers: [],
    confrontos: [],
    sinergias: [],
    referenciasMapa,
  });
  return {
    rows,
    dados,
    referenciasMapa,
    parametros: {
      ...dados,
      disponiveisIds: nomes,
      aliadosIds: [] as string[],
      inimigosIds: [] as string[],
      modoDeJogo: rows[0]?.modeId ?? "",
      perfisTaticos: perfis,
      turno: 1,
    },
  };
}
