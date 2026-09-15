import { useCallback, useEffect, useState } from "react";
import { TOPBRAWL_SOURCE_WEIGHT } from "@shared/hybridScore";

/**
 * Equilíbrio entre as duas fontes de estatísticas.
 *
 * O TopBrawl e o Brawl Planet medem a mesma coisa e raramente concordam ao
 * décimo. Até aqui o projeto fazia média simples — uma escolha defensável, mas
 * imposta. Quem acompanha as duas fontes de perto pode ter razões para confiar
 * mais numa: amostras maiores, patentes diferentes, atualizações mais rápidas.
 * Este ajuste deixa essa decisão a quem usa o site.
 *
 * Guardado por navegador, tal como o peso Vitória/Uso, e aplicado em todo o
 * lado: ranking, mapas e Draft recalculam de imediato.
 */
export const SOURCE_BALANCE_STORAGE_KEY = "brawl-hibrido:source-balance:v1";
export const SOURCE_BALANCE_EVENT = "brawl-hibrido:source-balance";

export type SourceBalancePreference = {
  /** Percentagem do TopBrawl, de 0 a 100. */
  topBrawl: number;
  /** O complemento, sempre 100 − topBrawl. */
  brawlPlanet: number;
};

export const officialSourceBalance: SourceBalancePreference = {
  topBrawl: Math.round(TOPBRAWL_SOURCE_WEIGHT * 100),
  brawlPlanet: 100 - Math.round(TOPBRAWL_SOURCE_WEIGHT * 100),
};

function normalizeShare(value: unknown) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : officialSourceBalance.topBrawl;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizePreference(value: unknown): SourceBalancePreference | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SourceBalancePreference>;
  if (typeof candidate.topBrawl !== "number") return null;
  const topBrawl = normalizeShare(candidate.topBrawl);
  return { topBrawl, brawlPlanet: 100 - topBrawl };
}

export function readSourceBalance(): SourceBalancePreference {
  if (typeof window === "undefined") return officialSourceBalance;
  try {
    const preference = normalizePreference(JSON.parse(window.localStorage.getItem(SOURCE_BALANCE_STORAGE_KEY) ?? "null"));
    if (preference) return preference;
  } catch {
    // O equilíbrio oficial continua a valer se o armazenamento local estiver inválido.
  }
  return officialSourceBalance;
}

export function writeSourceBalance(preference: Pick<SourceBalancePreference, "topBrawl">): SourceBalancePreference {
  const topBrawl = normalizeShare(preference.topBrawl);
  const normalized = { topBrawl, brawlPlanet: 100 - topBrawl };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SOURCE_BALANCE_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(SOURCE_BALANCE_EVENT));
  }
  return normalized;
}

export function useSourceBalance() {
  const [balance, setBalance] = useState<SourceBalancePreference>(readSourceBalance);

  useEffect(() => {
    const sync = () => setBalance(readSourceBalance());
    // O `storage` cobre outros separadores; o evento próprio cobre este.
    window.addEventListener("storage", sync);
    window.addEventListener(SOURCE_BALANCE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(SOURCE_BALANCE_EVENT, sync);
    };
  }, []);

  const updateBalance = useCallback((topBrawl: number) => {
    setBalance(writeSourceBalance({ topBrawl }));
  }, []);

  const resetBalance = useCallback(() => {
    setBalance(writeSourceBalance({ topBrawl: officialSourceBalance.topBrawl }));
  }, []);

  return {
    balance,
    /** Fração do TopBrawl (0–1), no formato que o cálculo do Score espera. */
    topBrawlWeight: balance.topBrawl / 100,
    hasCustomBalance: balance.topBrawl !== officialSourceBalance.topBrawl,
    updateBalance,
    resetBalance,
  };
}
