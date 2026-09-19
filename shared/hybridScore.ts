/**
 * Score Híbrido oficial: 70% taxa de vitória agregada normalizada por mapa
 * + 30% taxa de uso agregada normalizada por mapa. O Score 0–13 do TopBrawl
 * é mantido apenas como métrica de origem; nunca entra nesta fórmula.
 */
export const WIN_RATE_HYBRID_WEIGHT = 0.7;
export const USAGE_RATE_HYBRID_WEIGHT = 0.3;

/**
 * Fatia do Star Player na fórmula. Zero por omissão: é uma métrica opcional.
 *
 * POR QUE COMEÇA DESLIGADA
 *
 * A fórmula oficial é 70/30 e está publicada assim em todo o lado — no cartão
 * da fórmula, no rodapé do Draft, nas predefinições guardadas por quem usa o
 * site. Entrar a zero garante que ligar o interruptor é a ÚNICA forma de o
 * Score mudar: com ele desligado o número é, bit a bit, o mesmo de sempre.
 *
 * O QUE O STAR PLAYER MEDE, E PORQUE NÃO É REPETIÇÃO DA VITÓRIA
 *
 * É a percentagem de partidas em que aquele brawler foi eleito Star Player
 * naquele mapa. Medido na snapshot de produção de 19/09/2026, correlaciona
 * 0,62 com a taxa de vitória (mínimo 0,19 num mapa, máximo 0,78) e 0,44 com o
 * uso. Ou seja: anda no mesmo sentido, mas não é a mesma coisa. Depois de
 * normalizadas no mapa, as duas leituras afastam-se 13,8 pontos na mediana e
 * mais de 38 pontos em 10% dos casos.
 *
 * Traduzindo: a vitória diz se a equipa ganhou, o Star Player diz se foi
 * ESTE brawler a puxar. Um brawler de apoio pode ganhar muito e ser eleito
 * pouco; um carregador pode ser eleito muito em equipas que perdem na mesma.
 *
 * QUEM PUBLICA
 *
 * Só o Brawl Planet. O TopBrawl não publica Star Player, por isso aqui não há
 * equilíbrio entre fontes a aplicar — vale o valor único, exatamente como a
 * regra que `weighted` já segue para vitória e uso.
 */
export const STAR_PLAYER_HYBRID_WEIGHT = 0;

export type HybridTier = "S" | "A" | "B";

export type UsageWinMetricRow = {
  map: string;
  score?: number | null;
  tier?: HybridTier | null;
  winRate?: number | null;
  usage?: number | null;
  brawlPlanetWinRate?: number | null;
  topBrawlWinRate?: number | null;
  brawlPlanetPickRate?: number | null;
  topBrawlUseRate?: number | null;
  /** Só o Brawl Planet o publica; ausente significa "não se sabe", nunca zero. */
  brawlPlanetStarPlayer?: number | null;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function average(values: readonly (number | null | undefined)[]) {
  const published = values.filter(finite);
  return published.length ? published.reduce((sum, value) => sum + value, 0) / published.length : null;
}

/**
 * Peso do TopBrawl no equilíbrio entre as duas fontes, de 0 a 1. Meio a meio é
 * o valor oficial: nenhuma das duas mostrou ser mais fiável que a outra, por
 * isso a média simples é o ponto de partida honesto.
 */
export const TOPBRAWL_SOURCE_WEIGHT = 0.5;

/**
 * Combina os valores das duas fontes segundo o peso escolhido.
 *
 * A regra que interessa é a do valor em falta: quando só uma fonte publica,
 * vale essa por inteiro, **independentemente do peso**. Aplicar 20% a um valor
 * único daria um número 80% mais baixo do que a realidade — e um brawler que só
 * uma fonte cobre passaria a parecer terrível por um acidente de configuração,
 * não por ser mau.
 */
function weighted(topBrawl: number | null | undefined, brawlPlanet: number | null | undefined, topBrawlWeight: number) {
  // Um peso inválido tem de cair no oficial. `clamp` sozinho deixa passar NaN,
  // e a partir daí todo o Score do mapa vinha NaN — sem erro e sem número.
  const peso = clamp(finite(topBrawlWeight) ? topBrawlWeight : TOPBRAWL_SOURCE_WEIGHT, 0, 1);
  if (finite(topBrawl) && finite(brawlPlanet)) return topBrawl * peso + brawlPlanet * (1 - peso);
  if (finite(topBrawl)) return topBrawl;
  if (finite(brawlPlanet)) return brawlPlanet;
  return null;
}

/** Agrega as taxas de vitória identificáveis nas duas fontes, sem inventar valores ausentes. */
export function aggregatePublishedWinRate(row: UsageWinMetricRow, topBrawlWeight = TOPBRAWL_SOURCE_WEIGHT) {
  const combinado = weighted(row.topBrawlWinRate, row.brawlPlanetWinRate, topBrawlWeight);
  return combinado ?? average([row.winRate]);
}

/** Agrega Pick Rate do Brawl Planet e Use Rate do TopBrawl na mesma escala percentual. */
export function aggregatePublishedUsageRate(row: UsageWinMetricRow, topBrawlWeight = TOPBRAWL_SOURCE_WEIGHT) {
  const combinado = weighted(row.topBrawlUseRate, row.brawlPlanetPickRate, topBrawlWeight);
  return combinado ?? average([row.usage]);
}

/**
 * Devolve o Star Player publicado para esta linha.
 *
 * Não leva peso de fontes porque não há duas fontes: o TopBrawl não publica
 * esta métrica. Fica como função própria para o resto do código ler o Star
 * Player pela mesma porta por onde lê a vitória e o uso.
 */
export function aggregatePublishedStarPlayerRate(row: UsageWinMetricRow) {
  return finite(row.brawlPlanetStarPlayer) ? row.brawlPlanetStarPlayer : null;
}

/**
 * Converte uma taxa publicada em pontos comparáveis dentro do mapa atual.
 * Empates recebem o mesmo valor. Se todas as taxas forem iguais, cada brawler
 * recebe 50 pontos: o sinal não cria um desempate artificial.
 */
export function normalizeRateForMap(rate: number | null | undefined, mapRates: readonly (number | null | undefined)[]) {
  if (!finite(rate)) return null;
  const values = mapRates.filter(finite);
  if (!values.length) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (maximum === minimum) return 50;
  return clamp(((rate - minimum) / (maximum - minimum)) * 100);
}

/** Mantém o nome anterior para consumidores externos que normalizem somente uso. */
export const normalizeUsageRateForMap = normalizeRateForMap;

/**
 * O mínimo e o máximo de uma métrica dentro de um mapa.
 *
 * POR QUE ISTO EXISTE
 *
 * `normalizeRateForMap` recebe a lista inteira de taxas do mapa e tira dela o
 * mínimo e o máximo. Chamada uma vez, é barata. Chamada uma vez POR LINHA e
 * por métrica — que é o que `calculateHybridScoresByMap` fazia — passa a ser
 * quadrática: para cada uma das 108 linhas de um mapa, construía-se uma lista
 * nova de 108 valores e espalhava-se em `Math.min(...)`. Vezes três métricas,
 * vezes 26 mapas.
 *
 * Medido com a snapshot da produção (2808 linhas): 71 ms por passagem. E a
 * página faz quatro passagens a cada toque no cursor dos pesos, o que dava
 * 253 ms de espera por cada pixel arrastado.
 *
 * Os extremos de um mapa são os mesmos para todas as linhas desse mapa, por
 * isso calculam-se UMA vez na primeira volta e reutilizam-se. A conta passa de
 * quadrática a linear sem mudar um único resultado.
 */
type Extremos = { minimo: number; maximo: number } | null;

function extremosDe(values: readonly (number | null | undefined)[]): Extremos {
  let minimo = Infinity;
  let maximo = -Infinity;
  for (const value of values) {
    if (!finite(value)) continue;
    if (value < minimo) minimo = value;
    if (value > maximo) maximo = value;
  }
  return minimo === Infinity ? null : { minimo, maximo };
}

/** A mesma normalização de `normalizeRateForMap`, com os extremos já em mão. */
function normalizeComExtremos(rate: number | null | undefined, extremos: Extremos) {
  if (!finite(rate) || !extremos) return null;
  if (extremos.maximo === extremos.minimo) return 50;
  return clamp(((rate - extremos.minimo) / (extremos.maximo - extremos.minimo)) * 100);
}

/**
 * O Score de uma linha, já com as três métricas normalizadas no mapa.
 *
 * COMO OS DOIS PESOS SE COMBINAM
 *
 * `starPlayerWeight` é a fatia do TOTAL. `winRateWeight` é a divisão
 * Vitória/Uso do QUE SOBRA. Não é capricho: a escada por pick do Draft já
 * mexe no `winRateWeight` (0,70 no pick 1, 0,95 no pick 6) e tem de continuar
 * a significar o mesmo. Assim a escada reparte o resto e a fatia do Star
 * Player fica igual em todos os picks — que é o que faz dela uma percentagem
 * fixa escolhida uma vez, e não mais seis números para acertar.
 *
 * Com Star Player a 30% e a divisão do resto em 50/20, sai exatamente
 * 50% Vitória + 30% Star Player + 20% Uso. A conversão entre as duas leituras
 * está em `hybridWeightFractions`, do lado da interface.
 *
 * A REGRA DO VALOR EM FALTA
 *
 * Se a linha não tiver Star Player publicado, a fatia dele volta para a
 * vitória e o uso **na proporção que já tinham**. A linha fica pontuada
 * exatamente como se o Star Player estivesse desligado.
 *
 * Isto não é um detalhe: 55 das 2808 linhas da produção não têm Star Player,
 * e são precisamente os brawlers acabados de sair — Cosmo, Vince, Bolt,
 * Glowy, Najia. Sem esta regra, ligar o interruptor apagava do ranking quem
 * ainda não foi coberto pela fonte, e pareceria um erro do site em vez de
 * uma lacuna da fonte. A alternativa — multiplicar um valor ausente por zero
 * — punia o brawler por algo que não é culpa dele, o mesmo erro que
 * `weighted` já recusa cometer com as duas fontes.
 */
export function calculateHybridScoreForWinRateWeight(
  normalizedWinRate: number | null | undefined,
  normalizedUsageRate: number | null | undefined,
  winRateWeight = WIN_RATE_HYBRID_WEIGHT,
  normalizedStarPlayerRate: number | null | undefined = null,
  starPlayerWeight = STAR_PLAYER_HYBRID_WEIGHT,
): number | null {
  if (!finite(normalizedWinRate) || !finite(normalizedUsageRate)) return null;
  const safeWinWeight = clamp(winRateWeight, 0, 1);
  // Um peso inválido vale zero, pela mesma razão que `weighted` cai no oficial:
  // NaN a multiplicar deixava o Score inteiro NaN, sem erro e sem número.
  const pedido = clamp(finite(starPlayerWeight) ? starPlayerWeight : STAR_PLAYER_HYBRID_WEIGHT, 0, 1);
  const temStar = finite(normalizedStarPlayerRate);
  const fatiaStar = temStar ? pedido : 0;
  const resto = 1 - fatiaStar;

  return (clamp(normalizedWinRate) * safeWinWeight * resto)
    + (clamp(normalizedUsageRate) * (1 - safeWinWeight) * resto)
    + (temStar ? clamp(normalizedStarPlayerRate) * fatiaStar : 0);
}

/**
 * Aplica a fórmula a cada mapa, pois a normalização das três métricas é local.
 *
 * O Star Player é normalizado NO MAPA, como a vitória e o uso. Tem de ser: as
 * taxas brutas rondam os 10–31% e variam de mapa para mapa, por isso comparar
 * o valor cru entre mapas não diria nada. Normalizado, a pergunta passa a ser
 * a certa — "quanto é este brawler eleito, comparado com os outros NESTE
 * mapa?".
 */
export function calculateHybridScoresByMap<T extends UsageWinMetricRow>(
  rows: readonly T[],
  winRateWeight = WIN_RATE_HYBRID_WEIGHT,
  topBrawlWeight = TOPBRAWL_SOURCE_WEIGHT,
  starPlayerWeight = STAR_PLAYER_HYBRID_WEIGHT,
): T[] {
  // Primeira volta: agrega as três métricas de cada linha e guarda-as, para a
  // segunda volta não ter de as calcular outra vez.
  const metricasPorLinha = rows.map((row) => ({
    winRate: aggregatePublishedWinRate(row, topBrawlWeight),
    usage: aggregatePublishedUsageRate(row, topBrawlWeight),
    starPlayer: aggregatePublishedStarPlayerRate(row),
  }));

  const porMapa = new Map<string, { winRate: number | null; usage: number | null; starPlayer: number | null }[]>();
  for (let i = 0; i < rows.length; i++) {
    const doMapa = porMapa.get(rows[i].map);
    if (doMapa) doMapa.push(metricasPorLinha[i]);
    else porMapa.set(rows[i].map, [metricasPorLinha[i]]);
  }

  // Os extremos de cada mapa, calculados uma única vez. Ver `extremosDe`.
  const extremosPorMapa = new Map<string, { winRate: Extremos; usage: Extremos; starPlayer: Extremos }>();
  for (const [mapa, metricas] of porMapa) {
    extremosPorMapa.set(mapa, {
      winRate: extremosDe(metricas.map((metrica) => metrica.winRate)),
      usage: extremosDe(metricas.map((metrica) => metrica.usage)),
      starPlayer: extremosDe(metricas.map((metrica) => metrica.starPlayer)),
    });
  }

  return rows.map((row, i) => {
    const { winRate, usage, starPlayer } = metricasPorLinha[i];
    const extremos = extremosPorMapa.get(row.map);
    const winScore = normalizeComExtremos(winRate, extremos?.winRate ?? null);
    const usageScore = normalizeComExtremos(usage, extremos?.usage ?? null);
    const starScore = normalizeComExtremos(starPlayer, extremos?.starPlayer ?? null);
    const score = calculateHybridScoreForWinRateWeight(winScore, usageScore, winRateWeight, starScore, starPlayerWeight);
    return score === null
      ? { ...row, winRate, usage }
      : { ...row, winRate, usage, score, tier: hybridTierForScore(score) };
  });
}

export function hybridTierForScore(score: number): HybridTier {
  if (score >= 75) return "S";
  if (score >= 65) return "A";
  return "B";
}
