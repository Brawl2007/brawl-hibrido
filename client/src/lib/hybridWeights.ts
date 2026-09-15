import { useCallback, useEffect, useState } from "react";

export const HYBRID_WEIGHTS_STORAGE_KEY = "brawl-hibrido:global-hybrid-weights:v2";
export const HYBRID_WEIGHTS_EVENT = "brawl-hibrido:global-hybrid-weights";

export type HybridWeightsPreference = {
  winRate: number;
  usageRate: number;
};

const officialWeights: HybridWeightsPreference = { winRate: 70, usageRate: 30 };

function normalizeWinRateWeight(value: unknown) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : officialWeights.winRate;
  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function normalizePreference(value: unknown): HybridWeightsPreference | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<HybridWeightsPreference>;
  if (typeof candidate.winRate !== "number") return null;
  const winRate = normalizeWinRateWeight(candidate.winRate);
  return { winRate, usageRate: 100 - winRate };
}

export function readHybridWeights(): HybridWeightsPreference {
  if (typeof window === "undefined") return officialWeights;
  try {
    const preference = normalizePreference(JSON.parse(window.localStorage.getItem(HYBRID_WEIGHTS_STORAGE_KEY) ?? "null"));
    if (preference) return preference;
  } catch {
    // A fórmula oficial continua disponível mesmo se o armazenamento local estiver inválido.
  }
  return officialWeights;
}

export function writeHybridWeights(preference: Pick<HybridWeightsPreference, "winRate">): HybridWeightsPreference {
  const winRate = normalizeWinRateWeight(preference.winRate);
  const normalized = { winRate, usageRate: 100 - winRate };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(HYBRID_WEIGHTS_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(HYBRID_WEIGHTS_EVENT));
  }
  return normalized;
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

  const updateWeights = useCallback((winRate: number) => {
    const next = writeHybridWeights({ winRate });
    setWeights(next);
    return next;
  }, []);

  return { weights, updateWeights };
}
