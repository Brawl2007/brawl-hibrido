import { calcularWinRateBayesiano } from "./amostraPequena";
// shared/motorApiPerfeito.ts

export type OrdemTimeDraft = "first_pick" | "second_pick";

export interface PartidaBrutaApi {
  battleTimeIso: string;
  modo: string;
  mapa: string;
  eloMedioRank: "mitico" | "lendario" | "mestre" | "abaixo";
  todosNivel11: boolean;
  timeVencedorIds: string[];
  timePerdedorIds: string[];
  starPlayerId?: string;
}

export interface PerfilTaticoBrawler {
  id: string;
  role: "mid" | "side" | "flex";
  classe:
    | "sniper"
    | "thrower"
    | "tank"
    | "assassin"
    | "controller"
    | "damage"
    | "support";
  isWallbreaker?: boolean;
  isAntiTank?: boolean;
  isHeistDps?: boolean;
  dependsOnWalls?: boolean;
  dependsOnBushes?: boolean;
}

export interface EstatisticasApiMapa {
  brawlerId: string;
  vitoriasMapa: number;
  jogosMapa: number;
  vitoriasModo: number;
  jogosModo: number;
  taxaUsoMapa: number; // 0..1
}

export interface ConfrontoObservado {
  vitoriasA: number;
  jogosMapa: number;
  vitoriasAModo: number;
  jogosModo: number;
}

export interface ResultadoRecomendacaoApi {
  brawlerId: string;
  winProbability: number; // 0..100%
  logOddsFinal: number;
  turnoAtual: number; // 1..6
  fatores: {
    forcaMapaLogit: number;
    counterLiquidoLogit: number;
    penalidadeHardCounterLogit: number;
    sinergiaRealLogit: number;
    riscoMinimaxLogit: number;
    penalidadeTaticaLogit: number;
    ajustePoucoUsoLogit: number;
  };
  alertaHardCounter?: string[];
  melhorAlvoInimigo?: string;
  piorRespostaFuturaInimiga?: string;
}

export interface PareamentoLane3v3 {
  aliadoId: string;
  inimigoId: string;
  posicaoSugerida: "Mid" | "Side A" | "Side B";
  vantagemLogit: number;
  vantagemPercentualEstimada: number;
}

const CLAMP_MIN = 0.02;
const CLAMP_MAX = 0.98;
const LIMIAR_RUIDO_LOGIT = 0.06;
const MIN_AMOSTRA_EFETIVA_PAR = 6;

export function logit(p: number): number {
  const clamped = Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, p));
  return Math.log(clamped / (1 - clamped));
}

export function sigmoid(logOdds: number): number {
  return 1 / (1 + Math.exp(-logOdds));
}

export function sigmoidPercent(logOdds: number): number {
  return Number((sigmoid(logOdds) * 100).toFixed(1));
}

export function aplicarFiltroRuido(
  valorLogit: number,
  limiar = LIMIAR_RUIDO_LOGIT
): number {
  if (Math.abs(valorLogit) < limiar) return 0;
  return valorLogit > 0 ? valorLogit - limiar * 0.5 : valorLogit + limiar * 0.5;
}

/**
 * 1. Peso de qualidade de cada partida do /battlelog (Elo + Nível 11 + Decaimento Temporal de 14 dias)
 */
export { calcularPesoPartidaObservada } from "./idadeDosDados";

/**
 * 2. Suavização Bayesiana Hierárquica em 3 níveis (Mapa -> Modo -> Neutro 0.50)
 */
export { calcularWinRateBayesiano } from "./amostraPequena";

/**
 * 3. Trava Dinâmica V3 para Brawler com "Boa Vitória mas Pouco Uso no Mapa"
 */
export function ajustarForcaMapaPorUsoETurno(
  betaBruto: number,
  taxaUsoMapa: number,
  turnoAtual: number
): { betaAjustado: number; penalidadePoucoUso: number } {
  const uRef =
    turnoAtual <= 1
      ? 0.025 // 1º Pick exige presença consolidada (~2.5%+)
      : turnoAtual <= 3
        ? 0.016 // 2º e 3º Picks
        : turnoAtual <= 5
          ? 0.009 // 4º e 5º Picks
          : 0.003; // 6º Pick (Last Pick): libera escolhas cirúrgicas de nicho

  const uso = Math.max(0, taxaUsoMapa);
  const confiancaUso = uso / (uso + uRef);

  if (betaBruto <= 0) {
    return { betaAjustado: betaBruto, penalidadePoucoUso: 0 };
  }

  const fatorAbertura = Math.max(0, 1 - (turnoAtual - 1) / 4);
  const penalidadeExposicaoNicho = fatorAbertura * 0.22 * (1 - confiancaUso);
  const betaAjustado = betaBruto * confiancaUso - penalidadeExposicaoNicho;

  return {
    betaAjustado,
    penalidadePoucoUso: betaBruto - betaAjustado,
  };
}

/**
 * 4. Suavização Bayesiana para Pares (1v1 Counter e 2v2 Sinergia) + Cálculo de Amostra Efetiva
 */
export function calcularProbabilidadeParBayesiana(
  confronto: ConfrontoObservado | undefined,
  pEsperadoNeutro: number
): { pSuavizado: number; amostraEfetiva: number } {
  if (!confronto) return { pSuavizado: pEsperadoNeutro, amostraEfetiva: 0 };

  const amostraEfetiva = confronto.jogosMapa + 0.35 * confronto.jogosModo;
  const pModo =
    (confronto.vitoriasAModo + 35 * pEsperadoNeutro) /
    (confronto.jogosModo + 35);
  const pMapa =
    (confronto.vitoriasA + 25 * pModo + 25 * pEsperadoNeutro) /
    (confronto.jogosMapa + 25 + 25);

  return {
    pSuavizado: Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, pMapa)),
    amostraEfetiva,
  };
}

/**
 * 5. Counter Mecânico Puro (V2 + V3): desconta força base e amortece pares com poucos jogos (K = 35)
 */
export function calcularDeltaCounterPuro(
  betaBrutoA: number,
  betaBrutoB: number,
  confrontoAB: ConfrontoObservado | undefined
): number {
  const logitEsperado = betaBrutoA - betaBrutoB;
  const pEsperado = sigmoid(logitEsperado);
  const { pSuavizado, amostraEfetiva } = calcularProbabilidadeParBayesiana(
    confrontoAB,
    pEsperado
  );

  if (amostraEfetiva < MIN_AMOSTRA_EFETIVA_PAR) return 0;

  const confiancaVolumePar = amostraEfetiva / (amostraEfetiva + 35);
  const deltaBruto = logit(pSuavizado) - logitEsperado;

  return confiancaVolumePar * aplicarFiltroRuido(deltaBruto);
}

/**
 * 6. Sinergia Mecânica Pura (V2 + V3): desconta força individual, amortece pouco uso (K = 50)
 * e aplica Trava Anti-Carona se o candidato tiver WR < 46% sozinho no mapa.
 */
export function calcularDeltaSinergiaPura(
  betaBrutoA: number,
  betaBrutoAliado: number,
  duplaAAliado: ConfrontoObservado | undefined
): number {
  const logitEsperado = betaBrutoA + betaBrutoAliado;
  const pEsperado = sigmoid(logitEsperado);
  const { pSuavizado, amostraEfetiva } = calcularProbabilidadeParBayesiana(
    duplaAAliado,
    pEsperado
  );

  if (amostraEfetiva < MIN_AMOSTRA_EFETIVA_PAR) return 0;

  const confiancaVolumePar = amostraEfetiva / (amostraEfetiva + 50);
  const deltaFiltrado = aplicarFiltroRuido(logit(pSuavizado) - logitEsperado);

  const multiplicadorViabilidadePropria =
    deltaFiltrado > 0 && betaBrutoA < -0.16 ? 0.3 : 1.0;

  return confiancaVolumePar * multiplicadorViabilidadePropria * deltaFiltrado;
}

/** Residual do trio depois das forças individuais e das três sinergias de dupla. */
export function calcularDeltaSinergiaTripla(
  betas: number[],
  deltasDuplas: number[],
  trio?: ConfrontoObservado
) {
  const esperado =
    betas.reduce((a, b) => a + b, 0) + deltasDuplas.reduce((a, b) => a + b, 0);
  const { pSuavizado, amostraEfetiva } = calcularProbabilidadeParBayesiana(
    trio,
    sigmoid(esperado)
  );
  if (amostraEfetiva < MIN_AMOSTRA_EFETIVA_PAR) return 0;
  const residual = aplicarFiltroRuido(logit(pSuavizado) - esperado);
  return (
    ((residual * amostraEfetiva) / (amostraEfetiva + 75)) *
    (residual > 0 && betas[0] < -0.16 ? 0.3 : 1)
  );
}

/**
 * 7. Penalidades e Cobertura Tática Dinâmica (Mid/Side, Classes, Wallbreak em Tempo Real, Anti-Tank e Heist)
 */
export function calcularPenalidadeTaticaDinamica(params: {
  candidatoId: string;
  aliadosIds: string[];
  inimigosIds: string[];
  modoDeJogo: string;
  modificadorRanked?:
    "padrao" | "timed_detonation" | "quickfire" | "big_friend" | "barbed_ammo";
  perfis: Record<string, PerfilTaticoBrawler>;
}): number {
  const {
    candidatoId,
    aliadosIds,
    inimigosIds,
    modoDeJogo,
    modificadorRanked = "padrao",
    perfis,
  } = params;
  const cand = perfis[candidatoId];
  if (!cand) return 0;

  let penalidade = 0;
  const aliadosPerfis = aliadosIds.map(id => perfis[id]).filter(Boolean);
  const inimigosPerfis = inimigosIds.map(id => perfis[id]).filter(Boolean);

  // 7.1. Garantia de Mid antes de fechar a composição
  const temMidAliado = aliadosPerfis.some(
    a => a.role === "mid" || a.role === "flex"
  );
  if (!temMidAliado && cand.role === "side") {
    if (aliadosIds.length === 1) penalidade += 0.12;
    if (aliadosIds.length >= 2) penalidade += 0.38;
  }

  const temSideAliado = aliadosPerfis.some(
    a => a.role === "side" || a.role === "flex"
  );
  if (aliadosIds.length >= 2 && !temSideAliado && cand.role === "mid")
    penalidade += 0.18;

  // 7.2. Conflito de Classe e Função (Role Conflict Penalty estilo Deep Draft)
  const mesmaClasseCount = aliadosPerfis.filter(
    a => a.classe === cand.classe
  ).length;
  if (mesmaClasseCount === 1) {
    penalidade +=
      cand.classe === "thrower" || cand.classe === "assassin" ? 0.45 : 0.25;
  } else if (mesmaClasseCount >= 2) {
    penalidade += 0.85;
  }

  // 7.3. Estado Dinâmico do Mapa: Quebra de Parede (Wallbreak) e Destruição Programada
  const inimigoTemWallbreak = inimigosPerfis.some(e => e.isWallbreaker);
  const aliadoTemWallbreak = aliadosPerfis.some(a => a.isWallbreaker);
  const aliadoTemThrower = aliadosPerfis.some(
    a => a.classe === "thrower" || a.dependsOnWalls
  );
  const mapaVaiAbrir =
    inimigoTemWallbreak ||
    aliadoTemWallbreak ||
    modificadorRanked === "timed_detonation";

  if ((cand.classe === "thrower" || cand.dependsOnWalls) && mapaVaiAbrir) {
    penalidade += modificadorRanked === "timed_detonation" ? 0.45 : 0.3;
  }
  if (cand.isWallbreaker && aliadoTemThrower) {
    penalidade += 0.35; // Impede que o seu time destrua as paredes do próprio Thrower
  }

  // 7.4. Trava Obrigatória de DPS Anti-Tanque
  const aliadoTemAntiTank = aliadosPerfis.some(
    a => a.isAntiTank || a.classe === "damage"
  );
  const inimigoTemTankOuAssassino = inimigosPerfis.some(
    e => e.classe === "tank" || e.classe === "assassin"
  );
  if (
    aliadosIds.length >= 1 &&
    !aliadoTemAntiTank &&
    !cand.isAntiTank &&
    cand.classe !== "damage"
  ) {
    penalidade += inimigoTemTankOuAssassino ? 0.38 : 0.22;
  }

  // 7.5. Exigência de Dano ao Cofre em Heist (Roubo)
  if (
    (modoDeJogo.toLowerCase().includes("heist") ||
      modoDeJogo.toLowerCase() === "roubo") &&
    aliadosIds.length >= 1
  ) {
    const aliadoTemHeistDps = aliadosPerfis.some(a => a.isHeistDps);
    if (!aliadoTemHeistDps && !cand.isHeistDps) {
      penalidade += aliadosIds.length >= 2 ? 0.42 : 0.18;
    }
  }

  return penalidade;
}

/**
 * 8. Motor Principal Unificado (V1 + V2 + V3): Log-Odds + Trava de Pouco Uso + Veto Quadrático + Minimax Serpentine
 */
export function ranquearCandidatosApiPerfeito(params: {
  disponiveisIds: string[];
  aliadosIds: string[];
  inimigosIds: string[];
  modoDeJogo: string;
  modificadorRanked?:
    "padrao" | "timed_detonation" | "quickfire" | "big_friend" | "barbed_ammo";
  estatisticasMapa: Record<string, EstatisticasApiMapa>;
  obterConfronto: (a: string, b: string) => ConfrontoObservado | undefined;
  obterSinergia: (a: string, b: string) => ConfrontoObservado | undefined;
  perfisTaticos: Record<string, PerfilTaticoBrawler>;
  obterTrio?: (ids: string[]) => ConfrontoObservado | undefined;
  poolNivel11Usuario?: Set<string>;
  ordemTime?: OrdemTimeDraft;
  turno?: number;
}): ResultadoRecomendacaoApi[] {
  const {
    disponiveisIds,
    aliadosIds,
    inimigosIds,
    modoDeJogo,
    modificadorRanked = "padrao",
    estatisticasMapa,
    obterConfronto,
    obterSinergia,
    perfisTaticos,
    poolNivel11Usuario,
  } = params;

  const turnoAtual = Math.max(
    1,
    Math.min(6, params.turno ?? aliadosIds.length + inimigosIds.length + 1)
  );
  // Ordem 1-2-2-1: um pick duplo aliado não é uma resposta inimiga imediata.
  const ordem =
    params.ordemTime === "second_pick"
      ? [false, true, true, false, false, true]
      : [true, false, false, true, true, false];
  const proximoTurnoInimigo =
    ordem.findIndex((nos, i) => i >= turnoAtual && !nos) + 1;
  const bloqueados = new Set([...aliadosIds, ...inimigosIds]);
  const disponiveis = [...new Set(disponiveisIds)].filter(
    id => !bloqueados.has(id)
  );
  const picksInimigosRestantes = Math.max(0, 3 - inimigosIds.length);

  const betaBrutoMapa: Record<string, number> = {};
  const usoMapa: Record<string, number> = {};
  for (const id of Object.keys(estatisticasMapa)) {
    const wr = calcularWinRateBayesiano(estatisticasMapa[id]);
    betaBrutoMapa[id] = logit(wr);
    usoMapa[id] = estatisticasMapa[id]?.taxaUsoMapa ?? 0.005;
  }

  const topAmeacasPool = [...disponiveis].sort(
    (a, b) =>
      (betaBrutoMapa[b] ?? 0) +
      Math.log((usoMapa[b] ?? 0.01) + 0.02) -
      ((betaBrutoMapa[a] ?? 0) + Math.log((usoMapa[a] ?? 0.01) + 0.02))
  );

  const resultados: ResultadoRecomendacaoApi[] = [];

  for (const candId of disponiveis) {
    if (poolNivel11Usuario && !poolNivel11Usuario.has(candId)) {
      continue;
    }

    const betaBrutoCand = betaBrutoMapa[candId] ?? 0;
    const usoCand = usoMapa[candId] ?? 0.005;
    const { betaAjustado: betaCand, penalidadePoucoUso } =
      ajustarForcaMapaPorUsoETurno(betaBrutoCand, usoCand, turnoAtual);

    // A. Soma de Counters Reais e Veto Quadrático contra Hard-Counters já revelados
    let somaCounter = 0;
    let penalidadeHardCounter = 0;
    let piorDeltaIndividual = 0;
    let melhorDeltaIndividual = -999;
    let melhorAlvoInimigo: string | undefined;
    const alertaHardCounter: string[] = [];

    for (const inimigoId of inimigosIds) {
      const betaInimigo = betaBrutoMapa[inimigoId] ?? 0;
      const deltaC = calcularDeltaCounterPuro(
        betaBrutoCand,
        betaInimigo,
        obterConfronto(candId, inimigoId)
      );
      somaCounter += deltaC;

      if (deltaC > melhorDeltaIndividual) {
        melhorDeltaIndividual = deltaC;
        melhorAlvoInimigo = inimigoId;
      }

      if (deltaC < 0) {
        penalidadeHardCounter += 2.6 * Math.pow(Math.abs(deltaC), 2);
        if (deltaC < piorDeltaIndividual) piorDeltaIndividual = deltaC;
        if (deltaC <= -0.35) alertaHardCounter.push(inimigoId);
      }
    }

    if (piorDeltaIndividual <= -0.38) {
      penalidadeHardCounter += 0.65;
    }

    // B. Soma de Sinergia Mecânica Pura com os aliados já escolhidos
    let somaSinergia = 0;
    for (const aliadoId of aliadosIds) {
      const betaAliado = betaBrutoMapa[aliadoId] ?? 0;
      const deltaS = calcularDeltaSinergiaPura(
        betaBrutoCand,
        betaAliado,
        obterSinergia(candId, aliadoId)
      );
      somaSinergia += 0.85 * deltaS;
    }

    if (aliadosIds.length === 2 && params.obterTrio) {
      const [a, b] = aliadosIds;
      const betaA = betaBrutoMapa[a] ?? 0,
        betaB = betaBrutoMapa[b] ?? 0;
      somaSinergia +=
        0.85 *
        calcularDeltaSinergiaTripla(
          [betaBrutoCand, betaA, betaB],
          [
            calcularDeltaSinergiaPura(
              betaBrutoCand,
              betaA,
              obterSinergia(candId, a)
            ),
            calcularDeltaSinergiaPura(
              betaBrutoCand,
              betaB,
              obterSinergia(candId, b)
            ),
            calcularDeltaSinergiaPura(betaA, betaB, obterSinergia(a, b)),
          ],
          params.obterTrio([candId, a, b])
        );
    }

    // B.1. Regra de Ouro V3 ("Trava de Nicho Sem Counter"):
    // Brawler com < 1% de uso no mapa NÃO sobe nos picks 1 a 3 nem sem counter comprovado (>= +0.16)
    let penalidadeNichoSemCounter = 0;
    if (usoCand < 0.01) {
      if (turnoAtual <= 3 || somaCounter < 0.16) {
        penalidadeNichoSemCounter = 0.35;
      }
    }

    // C. Simulação Minimax de Resposta Inimiga + Risco Cego nos Picks 1 a 5
    let riscoMinimaxLogit = 0;
    let piorRespostaFuturaInimiga: string | undefined;

    if (picksInimigosRestantes > 0) {
      let riscoCegoAcumulado = 0;
      for (const ameacaId of disponiveis) {
        if (ameacaId === candId) continue;
        const delta = calcularDeltaCounterPuro(
          betaBrutoCand,
          betaBrutoMapa[ameacaId] ?? 0,
          obterConfronto(candId, ameacaId)
        );
        riscoCegoAcumulado +=
          (usoMapa[ameacaId] ?? 0) * Math.max(0, -delta) ** 2;
      }
      let piorRespostaInimigaValor = -999;
      const meuTimeSimulado = [...aliadosIds, candId];

      for (const ameacaId of topAmeacasPool
        .filter(id => id !== candId)
        .slice(0, 15)) {
        if (ameacaId === candId) continue;
        const betaAmeaca = betaBrutoMapa[ameacaId] ?? 0;
        const usoAmeaca = usoMapa[ameacaId] ?? 0.01;

        let vantagemInimiga = ajustarForcaMapaPorUsoETurno(
          betaAmeaca,
          usoAmeaca,
          proximoTurnoInimigo || 6
        ).betaAjustado;

        for (const meuAliadoId of meuTimeSimulado) {
          const betaMeuAliado = betaBrutoMapa[meuAliadoId] ?? 0;
          const deltaInimigoVsAliado = calcularDeltaCounterPuro(
            betaAmeaca,
            betaMeuAliado,
            obterConfronto(ameacaId, meuAliadoId)
          );
          vantagemInimiga += deltaInimigoVsAliado;
          if (deltaInimigoVsAliado < 0) {
            vantagemInimiga -=
              2.0 * Math.pow(Math.abs(deltaInimigoVsAliado), 2);
          }
        }

        const impactoPonderado = Math.pow(usoAmeaca, 0.35) * vantagemInimiga;
        if (impactoPonderado > piorRespostaInimigaValor) {
          piorRespostaInimigaValor = impactoPonderado;
          piorRespostaFuturaInimiga = ameacaId;
        }
      }

      const fatorExposicao = picksInimigosRestantes / 3;
      riscoMinimaxLogit =
        fatorExposicao *
        (2.8 * riscoCegoAcumulado +
          0.45 * Math.max(0, piorRespostaInimigaValor));
    }

    // D. Penalidade Tática Dinâmica
    const penalidadeTaticaLogit = calcularPenalidadeTaticaDinamica({
      candidatoId: candId,
      aliadosIds,
      inimigosIds,
      modoDeJogo,
      modificadorRanked,
      perfis: perfisTaticos,
    });

    const logOddsFinal =
      betaCand +
      somaCounter -
      penalidadeHardCounter +
      somaSinergia -
      riscoMinimaxLogit -
      penalidadeTaticaLogit -
      penalidadeNichoSemCounter;

    resultados.push({
      brawlerId: candId,
      winProbability: sigmoidPercent(logOddsFinal),
      logOddsFinal,
      turnoAtual,
      fatores: {
        forcaMapaLogit: betaBrutoCand,
        counterLiquidoLogit: somaCounter,
        penalidadeHardCounterLogit: -penalidadeHardCounter || 0,
        sinergiaRealLogit: somaSinergia,
        riscoMinimaxLogit: -riscoMinimaxLogit || 0,
        penalidadeTaticaLogit: -penalidadeTaticaLogit || 0,
        ajustePoucoUsoLogit:
          -(penalidadePoucoUso + penalidadeNichoSemCounter) || 0,
      },
      alertaHardCounter:
        alertaHardCounter.length > 0 ? alertaHardCounter : undefined,
      melhorAlvoInimigo,
      piorRespostaFuturaInimiga,
    });
  }

  return resultados.sort((a, b) => b.logOddsFinal - a.logOddsFinal);
}

/**
 * 9. Otimizador 3x3 de Pareamento de Lanes (Estilo Deep Draft "Best Lane Matchups")
 */
export function calcularMelhoresLanes3v3(params: {
  aliadosIds: string[];
  inimigosIds: string[];
  estatisticasMapa: Record<string, EstatisticasApiMapa>;
  obterConfronto: (a: string, b: string) => ConfrontoObservado | undefined;
  perfisTaticos: Record<string, PerfilTaticoBrawler>;
}): PareamentoLane3v3[] {
  const {
    aliadosIds,
    inimigosIds,
    estatisticasMapa,
    obterConfronto,
    perfisTaticos,
  } = params;
  if (aliadosIds.length === 0 || inimigosIds.length === 0) return [];

  const betaMapa: Record<string, number> = {};
  for (const id of [...aliadosIds, ...inimigosIds]) {
    betaMapa[id] = estatisticasMapa[id]
      ? logit(calcularWinRateBayesiano(estatisticasMapa[id]))
      : 0;
  }

  if (aliadosIds.length < 3 || inimigosIds.length < 3) {
    const tamanho = Math.min(aliadosIds.length, inimigosIds.length);
    let melhores: Array<{ a: string; e: string; delta: number }> = [],
      melhorSoma = -Infinity;
    const procurar = (
      restantesA: string[],
      restantesE: string[],
      pares: typeof melhores,
      soma: number
    ) => {
      if (pares.length === tamanho) {
        if (soma > melhorSoma) {
          melhorSoma = soma;
          melhores = pares;
        }
        return;
      }
      for (const a of restantesA)
        for (const e of restantesE) {
          const delta = calcularDeltaCounterPuro(
            betaMapa[a] ?? 0,
            betaMapa[e] ?? 0,
            obterConfronto(a, e)
          );
          procurar(
            restantesA.filter(id => id !== a),
            restantesE.filter(id => id !== e),
            [...pares, { a, e, delta }],
            soma + (delta < -0.3 ? delta * 1.8 : delta)
          );
        }
    };
    procurar(aliadosIds, inimigosIds, [], 0);
    return melhores
      .sort(
        (a, b) =>
          Number(perfisTaticos[b.a]?.role === "mid") -
          Number(perfisTaticos[a.a]?.role === "mid")
      )
      .map(({ a, e, delta }, i) => ({
        aliadoId: a,
        inimigoId: e,
        posicaoSugerida: (["Mid", "Side A", "Side B"] as const)[i],
        vantagemLogit: delta,
        vantagemPercentualEstimada: sigmoidPercent(delta),
      }));
  }

  const permutacoes = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];

  let melhorPermutacao = permutacoes[0];
  let maiorSomaLogit = -999;

  for (const perm of permutacoes) {
    let soma = 0;
    for (let i = 0; i < 3; i++) {
      const aId = aliadosIds[i];
      const eId = inimigosIds[perm[i]];
      const delta = calcularDeltaCounterPuro(
        betaMapa[aId] ?? 0,
        betaMapa[eId] ?? 0,
        obterConfronto(aId, eId)
      );
      soma += delta < -0.3 ? delta * 1.8 : delta;
    }
    if (soma > maiorSomaLogit) {
      maiorSomaLogit = soma;
      melhorPermutacao = perm;
    }
  }

  const indicesOrdenados = [0, 1, 2].sort((i, j) => {
    const rI = perfisTaticos[aliadosIds[i]]?.role === "mid" ? 0 : 1;
    const rJ = perfisTaticos[aliadosIds[j]]?.role === "mid" ? 0 : 1;
    return rI - rJ;
  });

  const posicoes: Array<"Mid" | "Side A" | "Side B"> = [
    "Mid",
    "Side A",
    "Side B",
  ];

  return indicesOrdenados.map((aliadoIdx, posIdx) => {
    const aId = aliadosIds[aliadoIdx];
    const eId = inimigosIds[melhorPermutacao[aliadoIdx]];
    const delta = calcularDeltaCounterPuro(
      betaMapa[aId] ?? 0,
      betaMapa[eId] ?? 0,
      obterConfronto(aId, eId)
    );
    return {
      aliadoId: aId,
      inimigoId: eId,
      posicaoSugerida: posicoes[posIdx],
      vantagemLogit: Number(delta.toFixed(3)),
      vantagemPercentualEstimada: sigmoidPercent(delta),
    };
  });
}

/**
 * 10. Recomendador de Bans Inteligente 100% API (Protege o 1º Pick pretendido ou remove os S+ do Mapa)
 */
export function recomendarBansApi(params: {
  disponiveisIds: string[];
  estatisticasMapa: Record<string, EstatisticasApiMapa>;
  obterConfronto: (a: string, b: string) => ConfrontoObservado | undefined;
  brawlerPretendidoId?: string;
}): Array<{ brawlerId: string; banScore: number; motivo: string }> {
  const {
    disponiveisIds,
    estatisticasMapa,
    obterConfronto,
    brawlerPretendidoId,
  } = params;

  const betaMapa: Record<string, number> = {};
  for (const id of disponiveisIds) {
    if (estatisticasMapa[id]) {
      betaMapa[id] = logit(calcularWinRateBayesiano(estatisticasMapa[id]));
    }
  }

  const betaPretendido = brawlerPretendidoId
    ? (betaMapa[brawlerPretendidoId] ?? 0)
    : 0;

  return disponiveisIds
    .filter(id => id !== brawlerPretendidoId)
    .map(id => {
      const stats = estatisticasMapa[id];
      const uso = stats?.taxaUsoMapa ?? 0.01;
      const beta = betaMapa[id] ?? 0;

      let ameacaAoPretendido = 0;
      if (brawlerPretendidoId) {
        const deltaInimigoContraPretendido = calcularDeltaCounterPuro(
          beta,
          betaPretendido,
          obterConfronto(id, brawlerPretendidoId)
        );
        if (deltaInimigoContraPretendido > 0) {
          ameacaAoPretendido = 2.2 * deltaInimigoContraPretendido;
        }
      }

      const banScore =
        Math.pow(uso, 0.45) * (Math.max(0, beta) + ameacaAoPretendido);
      const motivo =
        ameacaAoPretendido > 0.25
          ? `Hard-counter direto da sua escolha planejada`
          : `Dominante no mapa (${sigmoidPercent(beta)}% WR suavizado)`;

      return {
        brawlerId: id,
        banScore: Number((banScore * 100).toFixed(1)),
        motivo,
      };
    })
    .sort((a, b) => b.banScore - a.banScore);
}
