import { razoesDeUso, type ReferenciasMapaApi } from "./adequacaoAoMapa";
import type { ApoioDoMotorApi } from "./motorApiPerfeito";
export type ObservedMatchupRow = {
  map: string;
  mode: string;
  brawler: string;
  opponent: string;
  wins: number;
  losses: number;
  samples: number;
};

export type ObservedMatchupFilter = {
  map?: string;
  mode?: string;
};

export type ObservedMatchupResult = {
  brawler: string;
  opponent: string;
  wins: number;
  losses: number;
  samples: number;
  winRate: number | null;
  hasSufficientSample: boolean;
  minimumSample: number;
};

function normalized(value: string) {
  return value.trim().toLocaleUpperCase("pt-PT").replace(/\s+/g, " ");
}

function matchesFilter(row: ObservedMatchupRow, filter: ObservedMatchupFilter) {
  return (!filter.map || row.map === filter.map) && (!filter.mode || row.mode === filter.mode);
}

/**
 * Consolida apenas confrontos publicados pelo coletor. Cada linha representa
 * o resultado da equipa inteira numa partida Ranked; não infere duelos de lane.
 */
export function getObservedMatchup(
  rows: readonly ObservedMatchupRow[],
  brawler: string,
  opponent: string,
  filter: ObservedMatchupFilter = {},
  minimumSample = 30
): ObservedMatchupResult {
  const brawlerKey = normalized(brawler);
  const opponentKey = normalized(opponent);
  const aggregate = rows.reduce(
    (total, row) => {
      if (
        normalized(row.brawler) !== brawlerKey ||
        normalized(row.opponent) !== opponentKey ||
        !matchesFilter(row, filter)
      ) {
        return total;
      }
      total.wins += row.wins;
      total.losses += row.losses;
      return total;
    },
    { wins: 0, losses: 0 }
  );

  const samples = aggregate.wins + aggregate.losses;
  return {
    brawler,
    opponent,
    wins: aggregate.wins,
    losses: aggregate.losses,
    samples,
    winRate: samples > 0 ? (aggregate.wins / samples) * 100 : null,
    hasSufficientSample: samples >= minimumSample,
    minimumSample,
  };
}

/** Gera uma linha da matriz 105 × 105 sem preencher dados não observados. */
export function getObservedMatchupRow(
  rows: readonly ObservedMatchupRow[],
  brawler: string,
  opponents: readonly string[],
  filter: ObservedMatchupFilter = {},
  minimumSample = 30
) {
  return opponents
    .filter((opponent) => normalized(opponent) !== normalized(brawler))
    .map((opponent) => getObservedMatchup(rows, brawler, opponent, filter, minimumSample));
}

export function listObservedMaps(rows: readonly ObservedMatchupRow[]) {
  return Array.from(new Set(rows.map((row) => row.map))).sort((a, b) => a.localeCompare(b, "pt-PT"));
}

export function listObservedModes(rows: readonly ObservedMatchupRow[]) {
  return Array.from(new Set(rows.map((row) => row.mode))).sort((a, b) => a.localeCompare(b, "pt-PT"));
}

/** Entrada única do Draft, fichas e mapas: contagens brutas ficam disponíveis para auditoria. */
export type DadosApiParaMotor = {
  partidas: number;
  referenciasMapa?: ReferenciasMapaApi;
  partidasPonderadas?: number;
  brawlers: readonly import("./partidasObservadas").ContagemDeBrawler[];
  confrontos: readonly import("./partidasObservadas").ContagemDeConfronto[];
  sinergias: readonly import("./partidasObservadas").ContagemDeSinergia[];
  equipas?: readonly import("./partidasObservadas").ContagemDeEquipa[];
  priorModo?: {
    brawlers: readonly import("./partidasObservadas").ContagemDeBrawler[];
    confrontos: readonly import("./partidasObservadas").ContagemDeConfronto[];
    sinergias: readonly import("./partidasObservadas").ContagemDeSinergia[];
    equipas?: readonly import("./partidasObservadas").ContagemDeEquipa[];
  };
};

const chaveApi = (nome: string) => nome.toLowerCase().replace(/[^a-z0-9]/g, "");
export const jogosPonderados = (linha?: { jogos: number; jogosPonderados?: number }) => linha?.jogosPonderados ?? linha?.jogos ?? 0;
export const vitoriasPonderadas = (linha?: { vitorias: number; vitoriasPonderadas?: number }) => linha?.vitoriasPonderadas ?? linha?.vitorias ?? 0;

/** Índices O(1), para não procurar milhares de pares a cada simulação do draft. */
export function montarDadosDoMotorApi(nomes: readonly string[], dados: DadosApiParaMotor, apoio: ApoioDoMotorApi = {}) {
  const brawlers = new Map(dados.brawlers.map((linha) => [chaveApi(linha.brawler), linha]));
  const modo = new Map((dados.priorModo?.brawlers ?? []).map((linha) => [chaveApi(linha.brawler), linha]));
  const referencias = new Map(Object.entries(dados.referenciasMapa ?? {}).map(([nome, r]) => [chaveApi(nome), r]));
  const estatisticasMapa: Record<string, import("./motorApiPerfeito").EstatisticasApiMapa> = {};
  for (const nome of nomes) {
    const mapa = brawlers.get(chaveApi(nome));
    const doModo = modo.get(chaveApi(nome));
    estatisticasMapa[nome] = {
      brawlerId: nome, referenciaMapa: referencias.get(chaveApi(nome)), jogosMapa: jogosPonderados(mapa), vitoriasMapa: vitoriasPonderadas(mapa),
      jogosModo: jogosPonderados(doModo), vitoriasModo: vitoriasPonderadas(doModo),
      taxaUsoMapa: (dados.partidasPonderadas ?? dados.partidas) > 0
        ? Math.min(1, jogosPonderados(mapa) / (dados.partidasPonderadas ?? dados.partidas)) : 0,
    };
  }
  const razoes = razoesDeUso(estatisticasMapa);
  for (const [nome, stats] of Object.entries(estatisticasMapa)) stats.razaoUsoMapa = razoes[nome];
  const indexar = (lista: readonly { a: string; b: string; jogos: number; vitorias: number; jogosPonderados?: number; vitoriasPonderadas?: number }[], simetrico: boolean) => {
    const mapa = new Map<string, (typeof lista)[number]>();
    for (const linha of lista) {
      mapa.set(`${chaveApi(linha.a)}:${chaveApi(linha.b)}`, linha);
      if (simetrico) mapa.set(`${chaveApi(linha.b)}:${chaveApi(linha.a)}`, linha);
    }
    return mapa;
  };
  const priorDoPar = (lista: readonly { jogos: number; jogosPonderados?: number }[]) => {
    const volumes = lista.map(jogosPonderados).filter(n => n > 0).sort((a, b) => a - b);
    const mediana = volumes.length ? volumes[Math.floor(volumes.length / 2)] : 6;
    return Math.max(4, Math.min(12, Math.sqrt(mediana) * 3));
  };
  const kCounter = priorDoPar(dados.confrontos), kSinergia = priorDoPar(dados.sinergias);
  const pares = (mapa: ReturnType<typeof indexar>, modo: ReturnType<typeof indexar>, jogosPrior: number) => (a: string, b: string): import("./motorApiPerfeito").ConfrontoObservado | undefined => {
    const chave = `${chaveApi(a)}:${chaveApi(b)}`;
    const m = mapa.get(chave), g = modo.get(chave);
    return m || g ? { jogosPrior, vitoriasA: vitoriasPonderadas(m), jogosMapa: jogosPonderados(m), vitoriasAModo: vitoriasPonderadas(g), jogosModo: jogosPonderados(g) } : undefined;
  };
  const indexarTrios = (lista: NonNullable<DadosApiParaMotor["equipas"]>) => new Map(lista.map((l) => [l.membros.map(chaveApi).sort().join(":"), l]));
  const trios = indexarTrios(dados.equipas ?? []), triosModo = indexarTrios(dados.priorModo?.equipas ?? []);
  return {
    ...apoio,
    estatisticasMapa,
    obterConfronto: pares(indexar(dados.confrontos, false), indexar(dados.priorModo?.confrontos ?? [], false), kCounter),
    obterSinergia: pares(indexar(dados.sinergias, true), indexar(dados.priorModo?.sinergias ?? [], true), kSinergia),
    obterTrio: (ids: string[]): import("./motorApiPerfeito").ConfrontoObservado | undefined => {
      const chave = ids.map(chaveApi).sort().join(":"), m = trios.get(chave), g = triosModo.get(chave);
      return m || g ? { vitoriasA: vitoriasPonderadas(m), jogosMapa: jogosPonderados(m), vitoriasAModo: vitoriasPonderadas(g), jogosModo: jogosPonderados(g) } : undefined;
    },
  };
}
export type DadosDoMotorApi = ReturnType<typeof montarDadosDoMotorApi>;

/** Anexa a referência original sem alterar o modelo partilhado nem a pool do mapa. */
export function aplicarReferenciasDoMapa(dados: DadosDoMotorApi, referencias: ReferenciasMapaApi): DadosDoMotorApi {
  const porChave = new Map(Object.entries(referencias).map(([n,r]) => [chaveApi(n),r]));
  const estatisticasMapa = Object.fromEntries(Object.entries(dados.estatisticasMapa).map(([n,s]) => [n, { ...s, referenciaMapa: porChave.get(chaveApi(n)) ?? s.referenciaMapa }]));
  const razoes = razoesDeUso(estatisticasMapa);
  for (const [n,s] of Object.entries(estatisticasMapa)) s.razaoUsoMapa = razoes[n];
  return { ...dados, estatisticasMapa };
}
