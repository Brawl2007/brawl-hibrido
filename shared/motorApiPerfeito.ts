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
  taxaUsoMapa: number; // Unidade consistente por mapa; o motor usa a razão à média.
}

export interface ConfrontoObservado {
  vitoriasA: number;
  jogosMapa: number;
  vitoriasAModo: number;
  jogosModo: number;
  jogosPrior?: number;
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
  /** Impactos em pontos percentuais; a soma parte de 50% e chega à estimativa. */
  fatoresPercentuais?: ResultadoRecomendacaoApi["fatores"];
  bloqueado?: "hard-counter" | "nicho" | "composicao";
  falhasDeComposicao?: string[];
  melhorAliado?: string;
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

const LIMIAR_RUIDO = 0.01;
const PESO_COUNTER = 1.35;
const TETO_POSITIVO = Math.log(0.72 / 0.28);

export interface ApoioDoMotorApi {
  obterCounterDeReserva?: (a: string, b: string) => number | undefined;
  obterSinergiaDeReserva?: (a: string, b: string) => number | undefined;
}

export function logit(p: number): number {
  const limitado = Math.max(0.02, Math.min(0.98, p));
  return Math.log(limitado / (1 - limitado));
}
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const sigmoidPercent = (x: number) =>
  Number((100 * sigmoid(x)).toFixed(1));
export { calcularPesoPartidaObservada } from "./idadeDosDados";
export { calcularWinRateBayesiano } from "./amostraPequena";

/** Uma zona morta pequena; nenhum segundo multiplicador de volume. */
export function aplicarFiltroRuido(valor: number, limiar = LIMIAR_RUIDO) {
  const magnitude = Math.max(0, Math.abs(valor) - limiar);
  return magnitude ? Math.sign(valor) * magnitude : 0;
}

/** Razão, sem unidade: a mesma composição vale com uso em fração, presença ou %. */
export function razoesDeUso(estatisticas: Record<string, EstatisticasApiMapa>) {
  const positivos = Object.values(estatisticas)
    .map(s => Math.max(0, s.taxaUsoMapa))
    .filter(u => u > 0 && Number.isFinite(u));
  const media = positivos.reduce((a, b) => a + b, 0) / (positivos.length || 1);
  return Object.fromEntries(
    Object.keys(estatisticas).map(id => [
      id,
      media > 0 ? Math.max(0, estatisticas[id].taxaUsoMapa) / media : 1,
    ])
  );
}

export function ajustarForcaMapaPorUsoETurno(
  betaBruto: number,
  razaoUso: number,
  turno: number
) {
  const referencia = [1, 0.85, 0.7, 0.45, 0.3, 0.15][
    Math.max(0, Math.min(5, turno - 1))
  ];
  const confianca = Math.min(1, Math.max(0, razaoUso) / referencia);
  const penalidade =
    betaBruto > 0
      ? betaBruto * (1 - confianca) +
        0.18 * Math.max(0, 1 - (turno - 1) / 4) * (1 - confianca)
      : 0;
  return {
    betaAjustado: betaBruto - penalidade,
    penalidadePoucoUso: penalidade,
  };
}

/** O modo inclui o mapa: só a parte fora do mapa entra outra vez como evidência. */
export function calcularProbabilidadeParBayesiana(
  par: ConfrontoObservado | undefined,
  esperado: number
) {
  if (!par) return { pSuavizado: esperado, amostraEfetiva: 0 };
  const nMapa = Math.max(0, par.jogosMapa),
    nModoFora = Math.max(0, par.jogosModo - nMapa);
  const wMapa = Math.max(0, Math.min(nMapa, par.vitoriasA));
  const wModoFora = Math.max(0, Math.min(nModoFora, par.vitoriasAModo - wMapa));
  const n = nMapa + 0.35 * nModoFora;
  const k = Math.max(2, par.jogosPrior ?? 6);
  return {
    pSuavizado: (wMapa + 0.35 * wModoFora + k * esperado) / (n + k),
    amostraEfetiva: n,
  };
}

function residualPar(base: number, par?: ConfrontoObservado, reserva = 0) {
  // A fonte de apoio é o prior. A única mistura é N/(N+K), dentro da posterior.
  const esperado = sigmoid(base + reserva);
  const { pSuavizado } = calcularProbabilidadeParBayesiana(par, esperado);
  return aplicarFiltroRuido(logit(pSuavizado) - logit(sigmoid(base)));
}
export function calcularDeltaCounterPuro(
  a: number,
  b: number,
  par?: ConfrontoObservado,
  reserva = 0
) {
  return residualPar(a - b, par, reserva);
}
export function calcularDeltaSinergiaPura(
  a: number,
  b: number,
  par?: ConfrontoObservado,
  reserva = 0
) {
  const delta = residualPar(a + b, par, reserva);
  return delta * (delta > 0 && a < logit(0.46) ? 0.3 : 1);
}
export function calcularDeltaSinergiaTripla(
  betas: number[],
  duplas: number[],
  trio?: ConfrontoObservado
) {
  if (!trio) return 0;
  const base =
    betas.reduce((a, b) => a + b, 0) + duplas.reduce((a, b) => a + b, 0);
  const delta = residualPar(base, {
    ...trio,
    jogosPrior: Math.max(10, trio.jogosPrior ?? 10),
  });
  return delta * (delta > 0 && betas[0] < logit(0.46) ? 0.3 : 1);
}

/** O próximo turno da equipa na ordem real 1-2-2-1, após os picks já concluídos. */
export function proximoTurnoDaEquipa(
  concluidos: number,
  ordem: OrdemTimeDraft
): number | undefined {
  const primeira = [1, 4, 5],
    segunda = [2, 3, 6];
  return (ordem === "first_pick" ? primeira : segunda).find(
    n => n > concluidos
  );
}

/** Divisão proporcional da variação de probabilidade: impactos somam a estimativa menos 50%. */
export function impactosPercentuais(
  fatores: ResultadoRecomendacaoApi["fatores"]
) {
  const total = Object.values(fatores).reduce((a, b) => a + b, 0);
  const escala =
    Math.abs(total) < 1e-9 ? 25 : (100 * sigmoid(total) - 50) / total;
  return Object.fromEntries(
    Object.entries(fatores).map(([k, valor]) => [k, valor * escala])
  ) as typeof fatores;
}

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
  const temMidAliado = aliadosPerfis.some(a => a.role === "mid");
  if (!temMidAliado && cand.role !== "mid") {
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
      cand.classe === "thrower" ||
      cand.classe === "assassin" ||
      (cand.classe === "tank" &&
        !aliadosPerfis.some(a => a.classe === "support"))
        ? 0.45
        : 0.25;
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
  const aliadoTemAntiTank = aliadosPerfis.some(a => a.isAntiTank);
  const inimigoTemTankOuAssassino = inimigosPerfis.some(
    e => e.classe === "tank" || e.classe === "assassin"
  );
  if (aliadosIds.length >= 1 && !aliadoTemAntiTank && !cand.isAntiTank) {
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

/** Restrições do último aliado: centrar custos não pode ocultar funções em falta. */
export function falhasAoFecharEquipa(
  ids: string[],
  perfis: Record<string, PerfilTaticoBrawler>,
  modo: string
): string[] {
  if (ids.length < 3) return [];
  const equipa = ids.map(id => perfis[id]).filter(Boolean);
  const falhas: string[] = [];
  if (!equipa.some(p => p.role === "mid"))
    falhas.push("Falta um Mid na equipa");
  if (!equipa.some(p => p.isAntiTank)) falhas.push("Falta dano contra tanques");
  if (
    ["heist", "roubo"].includes(modo.toLowerCase()) &&
    !equipa.some(p => p.isHeistDps)
  )
    falhas.push("Falta dano consistente ao cofre");
  return falhas;
}

export type ParametrosMotorApi = ApoioDoMotorApi & {
  disponiveisIds: string[];
  aliadosIds: string[];
  inimigosIds: string[];
  modoDeJogo: string;
  modificadorRanked?:
    "padrao" | "timed_detonation" | "quickfire" | "big_friend" | "barbed_ammo";
  estatisticasMapa: Record<string, EstatisticasApiMapa>;
  obterConfronto: (a: string, b: string) => ConfrontoObservado | undefined;
  obterSinergia: (a: string, b: string) => ConfrontoObservado | undefined;
  obterTrio?: (ids: string[]) => ConfrontoObservado | undefined;
  perfisTaticos: Record<string, PerfilTaticoBrawler>;
  poolNivel11Usuario?: Set<string>;
  ordemTime?: OrdemTimeDraft;
  turno?: number;
};

export function ranquearCandidatosApiPerfeito(
  p: ParametrosMotorApi
): ResultadoRecomendacaoApi[] {
  const turno = Math.max(
    1,
    Math.min(6, p.turno ?? p.aliadosIds.length + p.inimigosIds.length + 1)
  );
  const bloqueados = new Set([...p.aliadosIds, ...p.inimigosIds]);
  const disponiveis = [...new Set(p.disponiveisIds)].filter(
    id => !bloqueados.has(id)
  );
  const razoes = razoesDeUso(p.estatisticasMapa);
  const betas = Object.fromEntries(
    Object.entries(p.estatisticasMapa).map(([id, stats]) => [
      id,
      logit(calcularWinRateBayesiano(stats)),
    ])
  );
  const beta = (id: string) => betas[id] ?? 0;
  const razao = (id: string) => razoes[id] ?? 1;
  const counterCache = new Map<string, number>(),
    sinergiaCache = new Map<string, number>();
  const counter = (a: string, b: string) => {
    const chave = `${a}\0${b}`;
    if (!counterCache.has(chave))
      counterCache.set(
        chave,
        calcularDeltaCounterPuro(
          beta(a),
          beta(b),
          p.obterConfronto(a, b),
          p.obterCounterDeReserva?.(a, b) ?? 0
        )
      );
    return counterCache.get(chave)!;
  };
  const sinergia = (a: string, b: string) => {
    const chave = `${a}\0${b}`;
    if (!sinergiaCache.has(chave))
      sinergiaCache.set(
        chave,
        calcularDeltaSinergiaPura(
          beta(a),
          beta(b),
          p.obterSinergia(a, b),
          p.obterSinergiaDeReserva?.(a, b) ?? 0
        )
      );
    return sinergiaCache.get(chave)!;
  };
  const candidatos = disponiveis.filter(
    id => !p.poolNivel11Usuario || p.poolNivel11Usuario.has(id)
  );
  const ameaças = [...disponiveis].sort(
    (a, b) => beta(b) + Math.log1p(razao(b)) - beta(a) - Math.log1p(razao(a))
  );
  const turnoInimigo = proximoTurnoDaEquipa(
    turno,
    p.ordemTime === "second_pick" ? "first_pick" : "second_pick"
  );
  const restantes = Math.max(0, 3 - p.inimigosIds.length);
  const somaUso = disponiveis.reduce((total, id) => total + razao(id), 0) || 1;

  const brutos = candidatos.map(id => {
    const interacoes = p.inimigosIds.map(inimigo => ({
      inimigo,
      delta: counter(id, inimigo),
    }));
    const saldo = interacoes.reduce((s, c) => s + c.delta, 0);
    const fortes = interacoes.filter(c => c.delta <= -0.38).map(c => c.inimigo);
    const hard =
      2.6 * interacoes.reduce((s, c) => s + Math.max(0, -c.delta) ** 2, 0) +
      (fortes.length ? 0.65 : 0);
    const nicho = razao(id) < 0.25 && (turno <= 3 || saldo < 0.16);
    const duplas = p.aliadosIds.map(aliado => ({
      aliado,
      delta: sinergia(id, aliado),
    }));
    let somaSinergia = duplas.reduce((s, c) => s + c.delta, 0);
    if (p.aliadosIds.length === 2 && p.obterTrio) {
      const [a, b] = p.aliadosIds;
      somaSinergia += calcularDeltaSinergiaTripla(
        [beta(id), beta(a), beta(b)],
        [...duplas.map(c => c.delta), sinergia(a, b)],
        p.obterTrio([id, a, b])
      );
    }
    let risco = 0,
      resposta: string | undefined,
      maiorResposta = 0;
    if (restantes > 0 && turnoInimigo) {
      const riscoCego = disponiveis
        .filter(k => k !== id)
        .reduce(
          (s, k) =>
            s + (razao(k) / somaUso) * Math.max(0, -counter(id, k)) ** 2,
          0
        );
      for (const k of ameaças.filter(k => k !== id).slice(0, 15)) {
        const pares = [...p.aliadosIds, id].map(a => counter(k, a));
        const valor =
          Math.pow(Math.min(razao(k), 4), 0.35) *
          (ajustarForcaMapaPorUsoETurno(beta(k), razao(k), turnoInimigo)
            .betaAjustado +
            pares.reduce((s, d) => s + d - 2 * Math.max(0, -d) ** 2, 0));
        if (valor > maiorResposta) {
          maiorResposta = valor;
          resposta = k;
        }
      }
      risco = (restantes / 3) * (2.8 * riscoCego + 0.45 * maiorResposta);
    }
    const tatica = calcularPenalidadeTaticaDinamica({
      candidatoId: id,
      aliadosIds: p.aliadosIds,
      inimigosIds: p.inimigosIds,
      modoDeJogo: p.modoDeJogo,
      modificadorRanked: p.modificadorRanked,
      perfis: p.perfisTaticos,
    });
    const uso =
      ajustarForcaMapaPorUsoETurno(beta(id), razao(id), turno)
        .penalidadePoucoUso + (nicho ? 0.4 : 0);
    const falhas = falhasAoFecharEquipa(
      [...p.aliadosIds, id],
      p.perfisTaticos,
      p.modoDeJogo
    );
    return {
      id,
      interacoes,
      duplas,
      saldo,
      hard,
      fortes,
      nicho,
      somaSinergia,
      risco,
      resposta,
      tatica,
      uso,
      falhas,
    };
  });
  const viaveis = brutos.filter(
    c => !c.fortes.length && !c.nicho && !c.falhas.length
  );
  const referencia = viaveis.length ? viaveis : brutos;
  const media = (campo: "risco" | "tatica" | "uso") =>
    referencia.reduce((s, c) => s + c[campo], 0) / (referencia.length || 1);
  const riscoMedio = media("risco"),
    taticaMedia = media("tatica"),
    usoMedio = media("uso");
  return brutos
    .map(c => {
      const fatores: ResultadoRecomendacaoApi["fatores"] = {
        forcaMapaLogit: beta(c.id),
        counterLiquidoLogit: PESO_COUNTER * c.saldo,
        penalidadeHardCounterLogit: -c.hard || 0,
        sinergiaRealLogit: c.somaSinergia,
        riscoMinimaxLogit: riscoMedio - c.risco,
        penalidadeTaticaLogit: taticaMedia - c.tatica,
        ajustePoucoUsoLogit: usoMedio - c.uso,
      };
      const bruto = Object.values(fatores).reduce((a, b) => a + b, 0);
      // Satura suavemente evidência positiva; não inventa uma vitória mínima sem sinal.
      const escala =
        bruto > 0
          ? (TETO_POSITIVO * Math.tanh(bruto / TETO_POSITIVO)) / bruto
          : 1;
      for (const k of Object.keys(fatores) as Array<keyof typeof fatores>)
        fatores[k] *= escala;
      const final = Object.values(fatores).reduce((a, b) => a + b, 0);
      const alvo = [...c.interacoes].sort((a, b) => b.delta - a.delta)[0];
      const aliado = [...c.duplas].sort((a, b) => b.delta - a.delta)[0];
      return {
        brawlerId: c.id,
        logOddsFinal: final,
        winProbability: sigmoidPercent(final),
        turnoAtual: turno,
        fatores,
        fatoresPercentuais: impactosPercentuais(fatores),
        bloqueado: c.fortes.length
          ? ("hard-counter" as const)
          : c.nicho
            ? ("nicho" as const)
            : c.falhas.length
              ? ("composicao" as const)
              : undefined,
        falhasDeComposicao: c.falhas.length ? c.falhas : undefined,
        alertaHardCounter: c.fortes.length ? c.fortes : undefined,
        melhorAlvoInimigo: alvo && alvo.delta > 0.01 ? alvo.inimigo : undefined,
        melhorAliado: aliado && aliado.delta > 0.01 ? aliado.aliado : undefined,
        piorRespostaFuturaInimiga:
          c.risco > riscoMedio + 0.015 ? c.resposta : undefined,
      };
    })
    .sort(
      (a, b) =>
        Number(Boolean(a.bloqueado)) - Number(Boolean(b.bloqueado)) ||
        b.logOddsFinal - a.logOddsFinal
    );
}

/** Posição e confronto entram juntos na procura; o Mid verdadeiro ocupa o centro. */
export function calcularMelhoresLanes3v3(
  p: Pick<
    ParametrosMotorApi,
    | "aliadosIds"
    | "inimigosIds"
    | "estatisticasMapa"
    | "obterConfronto"
    | "perfisTaticos"
    | "obterCounterDeReserva"
  >
): PareamentoLane3v3[] {
  const n = Math.min(3, p.aliadosIds.length, p.inimigosIds.length);
  if (!n) return [];
  const posicoes = ["Mid", "Side A", "Side B"] as const;
  const beta = (id: string) =>
    p.estatisticasMapa[id]
      ? logit(calcularWinRateBayesiano(p.estatisticasMapa[id]))
      : 0;
  const role = (id: string) => p.perfisTaticos[id]?.role ?? "flex";
  const temMid = (ids: string[]) => ids.some(id => role(id) === "mid");
  const adequacao = (id: string, meio: boolean) =>
    meio
      ? role(id) === "mid"
        ? 0.6
        : role(id) === "flex"
          ? 0.15
          : -0.7
      : role(id) === "side"
        ? 0.15
        : role(id) === "flex"
          ? 0.1
          : -0.3;
  let melhor = -Infinity,
    resultado: PareamentoLane3v3[] = [];
  const procurar = (
    aliados: string[],
    inimigos: string[],
    slots: number[],
    pares: PareamentoLane3v3[],
    score: number
  ) => {
    if (pares.length === n) {
      if (score > melhor) {
        melhor = score;
        resultado = pares;
      }
      return;
    }
    for (const slot of slots)
      for (const a of aliados)
        for (const e of inimigos) {
          if (
            slot === 0 &&
            ((temMid(p.aliadosIds) && role(a) !== "mid") ||
              (temMid(p.inimigosIds) && role(e) !== "mid"))
          )
            continue;
          // Num 3v3 completo não deslocar um Mid para os lados para evitar o confronto central.
          if (
            n === 3 &&
            slot !== 0 &&
            ((p.aliadosIds.filter(id => role(id) === "mid").length === 1 &&
              role(a) === "mid") ||
              (p.inimigosIds.filter(id => role(id) === "mid").length === 1 &&
                role(e) === "mid"))
          )
            continue;
          const delta = calcularDeltaCounterPuro(
            beta(a),
            beta(e),
            p.obterConfronto(a, e),
            p.obterCounterDeReserva?.(a, e) ?? 0
          );
          const vantagem = beta(a) - beta(e) + delta;
          procurar(
            aliados.filter(id => id !== a),
            inimigos.filter(id => id !== e),
            slots.filter(s => s !== slot),
            [
              ...pares,
              {
                aliadoId: a,
                inimigoId: e,
                posicaoSugerida: posicoes[slot],
                vantagemLogit: vantagem,
                vantagemPercentualEstimada: sigmoidPercent(vantagem),
              },
            ],
            score +
              vantagem -
              2.6 * Math.max(0, -delta) ** 2 +
              adequacao(a, slot === 0) +
              adequacao(e, slot === 0)
          );
        }
  };
  procurar(p.aliadosIds, p.inimigosIds, [0, 1, 2], [], 0);
  return resultado.sort(
    (a, b) =>
      posicoes.indexOf(a.posicaoSugerida) - posicoes.indexOf(b.posicaoSugerida)
  );
}

export function recomendarBansApi(
  p: Pick<
    ParametrosMotorApi,
    | "disponiveisIds"
    | "estatisticasMapa"
    | "obterConfronto"
    | "obterCounterDeReserva"
  > & { brawlerPretendidoId?: string }
) {
  const razoes = razoesDeUso(p.estatisticasMapa);
  const beta = (id: string) =>
    p.estatisticasMapa[id]
      ? logit(calcularWinRateBayesiano(p.estatisticasMapa[id]))
      : 0;
  const alvo = p.brawlerPretendidoId;
  return p.disponiveisIds
    .filter(id => id !== alvo)
    .map(id => {
      const ameaca = alvo
        ? Math.max(
            0,
            calcularDeltaCounterPuro(
              beta(id),
              beta(alvo),
              p.obterConfronto(id, alvo),
              p.obterCounterDeReserva?.(id, alvo) ?? 0
            )
          )
        : 0;
      const score =
        Math.pow(
          Math.max(razoes[id] ?? 1, alvo && ameaca > 0.1 ? 0.2 : 0),
          0.45
        ) *
        (Math.max(0, beta(id)) + 2.2 * ameaca);
      return {
        brawlerId: id,
        banScore: Number((100 * score).toFixed(1)),
        motivo:
          ameaca > 0.1
            ? `Counter da escolha pretendida: ${alvo}`
            : "Presença e força neste mapa",
      };
    })
    .sort((a, b) => b.banScore - a.banScore);
}
