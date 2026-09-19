import { useCallback, useEffect, useState } from "react";

/**
 * A divisão de pesos do Score Híbrido, guardada por navegador.
 *
 * A v3 acrescentou o Star Player como terceira métrica opcional. A chave subiu
 * de versão porque o formato mudou, mas a v2 continua a ser lida: quem já
 * tinha 75/25 guardado mantém-no, com o Star Player desligado. Perder a
 * escolha de quem já a tinha feito seria transformar uma funcionalidade nova
 * num incómodo.
 */
export const HYBRID_WEIGHTS_STORAGE_KEY = "brawl-hibrido:global-hybrid-weights:v3";
/** A chave anterior, só para leitura, para a divisão já escolhida não se perder. */
export const HYBRID_WEIGHTS_LEGACY_STORAGE_KEY = "brawl-hibrido:global-hybrid-weights:v2";
export const HYBRID_WEIGHTS_EVENT = "brawl-hibrido:global-hybrid-weights";

export type HybridWeightsPreference = {
  /** Percentagem da taxa de vitória no total. */
  winRate: number;
  /** Percentagem da taxa de uso no total. */
  usageRate: number;
  /** Percentagem do Star Player no total. Só conta com `starPlayerEnabled`. */
  starPlayer: number;
  /** O interruptor. Desligado, a fórmula é exatamente a de sempre. */
  starPlayerEnabled: boolean;
};

export const officialHybridWeights: HybridWeightsPreference = {
  winRate: 70,
  usageRate: 30,
  /**
   * 30 é a sugestão inicial do cursor, não um peso ativo: com o interruptor
   * desligado esta percentagem não entra em conta nenhuma. Guardar um valor
   * já razoável evita que ligar o Star Player comece por não fazer nada, que
   * é a forma mais rápida de um interruptor parecer avariado.
   */
  starPlayer: 30,
  starPlayerEnabled: false,
};

function inteiroEntre(value: unknown, fallback: number) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

/**
 * Põe os três pesos a somar exatamente 100.
 *
 * Vitória e Star Player são o que a pessoa escolheu; o Uso é o resto. Se os
 * dois primeiros passarem de 100, o Star Player cede o excesso — porque é o
 * cursor que acabou de ser mexido que deve ganhar, e a vitória é a métrica
 * que o site publica como principal.
 */
function equilibrar(winRate: number, starPlayer: number, starPlayerEnabled: boolean): HybridWeightsPreference {
  const vitoria = inteiroEntre(winRate, officialHybridWeights.winRate);
  const star = inteiroEntre(starPlayer, officialHybridWeights.starPlayer);
  if (!starPlayerEnabled) return { winRate: vitoria, usageRate: 100 - vitoria, starPlayer: star, starPlayerEnabled: false };
  const starAtivo = Math.min(star, 100 - vitoria);
  return { winRate: vitoria, starPlayer: starAtivo, usageRate: 100 - vitoria - starAtivo, starPlayerEnabled: true };
}

function normalizePreference(value: unknown): HybridWeightsPreference | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<HybridWeightsPreference>;
  if (typeof candidate.winRate !== "number") return null;
  return equilibrar(
    candidate.winRate,
    typeof candidate.starPlayer === "number" ? candidate.starPlayer : officialHybridWeights.starPlayer,
    candidate.starPlayerEnabled === true,
  );
}

export function readHybridWeights(): HybridWeightsPreference {
  if (typeof window === "undefined") return officialHybridWeights;
  try {
    const atual = normalizePreference(JSON.parse(window.localStorage.getItem(HYBRID_WEIGHTS_STORAGE_KEY) ?? "null"));
    if (atual) return atual;
    // Sem v3: aproveita-se a divisão Vitória/Uso da v2 e entra-se sem Star Player.
    const anterior = normalizePreference(JSON.parse(window.localStorage.getItem(HYBRID_WEIGHTS_LEGACY_STORAGE_KEY) ?? "null"));
    if (anterior) return anterior;
  } catch {
    // A fórmula oficial continua disponível mesmo se o armazenamento local estiver inválido.
  }
  return officialHybridWeights;
}

/**
 * Reparte a vitória e o uso quando o interruptor do Star Player muda de estado.
 *
 * O ERRO QUE ISTO CORRIGE
 *
 * Sem isto, ligar o Star Player a 30% com a fórmula oficial (70/30) dava
 * **70% Vitória / 30% Star Player / 0% Uso**. Foi o que apareceu no ecrã ao
 * experimentar no navegador: a taxa de uso desaparecia do Score sem ninguém
 * ter pedido isso. A fatia nova saía toda do uso, porque o uso era "o resto".
 *
 * A regra certa é a proporcional: a fatia do Star Player sai dos dois pesos
 * existentes na proporção que eles já têm. 70/30 com 30% de Star Player passa
 * a 49/30/21 — os 70:30 mantidos dentro dos 70% que sobram. E desligar desfaz
 * a conta pelo mesmo caminho: 49/30/21 volta exatamente a 70/30.
 *
 * Mexer no cursor da vitória continua a valer por cima disto: quem arrastar
 * para 50 com o Star Player a 30 fica com 50/30/20, tal e qual.
 */
function repartirAoComutar(atual: HybridWeightsPreference, star: number, vaiFicarLigado: boolean) {
  if (vaiFicarLigado) {
    const fatiaRestante = Math.max(0, 100 - Math.max(0, Math.min(100, Math.round(star))));
    return Math.round(atual.winRate * fatiaRestante / 100);
  }
  // A desligar: a vitória recupera a fatia que tinha DENTRO do que não era
  // Star Player, para o interruptor ser reversível sem perder a escolha.
  const resto = atual.winRate + atual.usageRate;
  return resto > 0 ? Math.round(atual.winRate * 100 / resto) : atual.winRate;
}

export function writeHybridWeights(preference: Partial<Pick<HybridWeightsPreference, "winRate" | "starPlayer" | "starPlayerEnabled">>): HybridWeightsPreference {
  const atual = readHybridWeights();
  const star = preference.starPlayer ?? atual.starPlayer;
  const ligado = preference.starPlayerEnabled ?? atual.starPlayerEnabled;
  const comutou = preference.starPlayerEnabled !== undefined && preference.starPlayerEnabled !== atual.starPlayerEnabled;
  const normalized = equilibrar(
    preference.winRate ?? (comutou ? repartirAoComutar(atual, star, ligado) : atual.winRate),
    star,
    ligado,
  );
  if (typeof window !== "undefined") {
    window.localStorage.setItem(HYBRID_WEIGHTS_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(HYBRID_WEIGHTS_EVENT));
  }
  return normalized;
}

/**
 * Converte as percentagens da interface nas duas frações que o cálculo espera.
 *
 * `starPlayerWeight` é a fatia do total; `winRateWeight` é a divisão
 * Vitória/Uso do que sobra. Com 50/30/20 dá star=0,30 e win=50/70≈0,714, que
 * aplicados devolvem exatamente 50/30/20. Ver `calculateHybridScoreForWinRateWeight`.
 *
 * Com o Star Player desligado, `winRateWeight` é `winRate/100` — a mesma conta
 * de sempre, sem desvio de arredondamento.
 */
export function hybridWeightFractions(weights: HybridWeightsPreference) {
  const starPlayerWeight = weights.starPlayerEnabled ? weights.starPlayer / 100 : 0;
  const resto = weights.winRate + weights.usageRate;
  return {
    winRateWeight: resto > 0 ? weights.winRate / resto : 1,
    starPlayerWeight,
  };
}

/**
 * A etiqueta curta da divisão em vigor: "70/30", ou "50/30/20" com o Star
 * Player ligado. A ordem é a mesma em que os cursores aparecem na interface —
 * Vitória, Star Player, Uso — para o número no rodapé do Draft se ler sem
 * precisar de legenda.
 */
export function hybridWeightsLabel(weights: HybridWeightsPreference) {
  return weights.starPlayerEnabled
    ? `${weights.winRate}/${weights.starPlayer}/${weights.usageRate}`
    : `${weights.winRate}/${weights.usageRate}`;
}

/** A mesma divisão por extenso, para títulos e legendas onde há espaço. */
export function hybridWeightsSentence(weights: HybridWeightsPreference) {
  return weights.starPlayerEnabled
    ? `Vitória ${weights.winRate}% / Star Player ${weights.starPlayer}% / Uso ${weights.usageRate}%`
    : `Vitória ${weights.winRate}% / Uso ${weights.usageRate}%`;
}

export function useHybridWeights() {
  const [weights, setWeights] = useState<HybridWeightsPreference>(readHybridWeights);

  useEffect(() => {
    const sync = () => setWeights(readHybridWeights());
    window.addEventListener("storage", sync);
    window.addEventListener(HYBRID_WEIGHTS_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(HYBRID_WEIGHTS_EVENT, sync);
    };
  }, []);

  const updateWeights = useCallback((preference: number | Partial<Pick<HybridWeightsPreference, "winRate" | "starPlayer" | "starPlayerEnabled">>) => {
    const next = writeHybridWeights(typeof preference === "number" ? { winRate: preference } : preference);
    setWeights(next);
    return next;
  }, []);

  const fractions = hybridWeightFractions(weights);
  return { weights, updateWeights, winRateWeight: fractions.winRateWeight, starPlayerWeight: fractions.starPlayerWeight };
}
