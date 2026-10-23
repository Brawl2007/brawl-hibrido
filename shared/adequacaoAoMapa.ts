import {
  aggregatePublishedUsageRate,
  aggregatePublishedWinRate,
  type UsageWinMetricRow,
} from "./hybridScore";
import { getMainAttackRange } from "./brawlerAttackRanges";
import { getBrawlerAttackRangeBand } from "./brawlerAttackRangeBands";
import { tipoDaCasa, type TerrenoDoMapa } from "./terrenoDoMapa";

export type ReferenciaMapaApi = {
  vitoria: number | null;
  uso: number | null;
  score: number | null;
  adequacaoTerreno: number;
};
export type ReferenciasMapaApi = Readonly<Record<string, ReferenciaMapaApi>>;
type Perfil = { classe: string; dependsOnWalls?: boolean };
const chave = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const limitar = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));

/** Perfis geométricos de recurso; a grelha corrigida/rotulada tem prioridade. */
const ABERTURA_DOS_MAPAS: Record<string, number> = {
  bridgetoofar: 0.98,
  shootingstar: 0.98,
  outintheopen: 0.95,
  hotpotato: 0.2,
  bellesrock: 0.35,
  centerstage: 0.2,
  sneakyfields: 0.12,
};
export function aberturaDoMapa(
  nome?: string,
  terreno?: TerrenoDoMapa | null
): number | null {
  const catalogo = ABERTURA_DOS_MAPAS[chave(nome ?? "")];
  if (!terreno) return catalogo ?? null;
  let paredes = 0,
    mato = 0;
  for (let l = 0; l < terreno.linhas; l++)
    for (let c = 0; c < terreno.colunas; c++) {
      const tipo = tipoDaCasa(terreno, c, l);
      if (tipo === "parede" || tipo === "destrutivel") paredes++;
      if (tipo === "mato") mato++;
    }
  const n = terreno.colunas * terreno.linhas;
  const medida = limitar((0.24 - paredes / n) / 0.2 - (0.7 * mato) / n);
  // A leitura por cor é aproximada. Sem correção humana/IA, o perfil conhecido é mais fiável.
  if (
    catalogo !== undefined &&
    terreno.rotulado === "regra" &&
    !Object.keys(terreno.correcoes ?? {}).length
  )
    return 0.8 * catalogo + 0.2 * medida;
  return medida;
}

export function adequacaoAoTerreno(
  nome: string,
  perfil: Perfil | undefined,
  abertura: number | null
): number {
  if (abertura === null) return 0.85;
  const alcance =
    getMainAttackRange(nome) ?? getBrawlerAttackRangeBand(nome)?.minTiles;
  if (abertura >= 0.7) {
    if (
      perfil?.classe === "thrower" ||
      perfil?.classe === "tank" ||
      perfil?.classe === "assassin"
    )
      return 0.25;
    if (perfil?.classe === "sniper") return 1;
    if (alcance !== undefined && alcance !== null)
      return alcance >= 8 ? 0.95 : alcance >= 7 ? 0.55 : 0.25;
    return 0.45;
  }
  if (abertura <= 0.4) {
    if (perfil?.classe === "thrower" || perfil?.dependsOnWalls) return 0.98;
    return perfil?.classe === "tank" || perfil?.classe === "assassin"
      ? 0.9
      : 0.85;
  }
  return 0.85;
}

/** Recebe as linhas originais do mapa, antes de substituir taxas pela API. */
export function criarReferenciasDoMapa<
  T extends Omit<UsageWinMetricRow, "map"> & { brawler: string; map?: string },
>(
  rows: readonly T[],
  perfis: Readonly<Record<string, Perfil>>,
  nome?: string,
  terreno?: TerrenoDoMapa | null
): ReferenciasMapaApi {
  const abertura = aberturaDoMapa(nome, terreno);
  return Object.fromEntries(
    rows
      .filter(r => !nome || !r.map || r.map === nome)
      .map(r => {
        const original = { ...r, map: r.map ?? nome ?? "" };
        return [
          r.brawler,
          {
            vitoria:
              aggregatePublishedWinRate(original) === null
                ? null
                : limitar(
                    aggregatePublishedWinRate(original)! / 100,
                    0.02,
                    0.98
                  ),
            uso: aggregatePublishedUsageRate(original),
            score:
              typeof r.score === "number" && Number.isFinite(r.score)
                ? limitar(r.score / 100)
                : null,
            adequacaoTerreno: adequacaoAoTerreno(
              r.brawler,
              perfis[r.brawler],
              abertura
            ),
          },
        ];
      })
  );
}

type UsoNoMapa = {
  taxaUsoMapa: number;
  jogosMapa: number;
  referenciaMapa?: ReferenciaMapaApi;
};
/** Combina razões sem misturar unidades; referências e amostra pertencem ao mesmo mapa. */
export function razoesDeUso(estatisticas: Record<string, UsoNoMapa>) {
  const mediaPositiva = (xs: number[]) => {
    const positivos = xs.filter(x => Number.isFinite(x) && x > 0);
    return positivos.reduce((a, b) => a + b, 0) / (positivos.length || 1);
  };
  const valores = Object.values(estatisticas);
  const mediaApi = mediaPositiva(valores.map(s => s.taxaUsoMapa));
  const mediaReferencia = mediaPositiva(
    valores.map(s => s.referenciaMapa?.uso ?? 0)
  );
  const partidas = valores.reduce((s, r) => s + r.jogosMapa, 0) / 6;
  const pesoApi = mediaApi > 0 ? Math.min(0.8, partidas / (partidas + 300)) : 0;
  return Object.fromEntries(
    Object.entries(estatisticas).map(([id, s]) => {
      const api = mediaApi > 0 ? Math.max(0, s.taxaUsoMapa) / mediaApi : 1;
      const uso = s.referenciaMapa?.uso;
      const referencia =
        mediaReferencia > 0 && uso != null
          ? Math.max(0, uso) / mediaReferencia
          : undefined;
      return [
        id,
        referencia === undefined
          ? api
          : pesoApi * api + (1 - pesoApi) * referencia,
      ];
    })
  );
}
