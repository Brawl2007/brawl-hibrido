import { useCallback, useEffect, useState } from "react";
import { setBrawlScopeReading } from "@shared/counterMatchupValue";
import {
  DEFAULT_BRAWLSCOPE_READING,
  normalizeBrawlScopeReading,
  type BrawlScopeReadingId,
} from "@shared/brawlScopeReading";

export const BRAWLSCOPE_READING_STORAGE_KEY = "brawl-hibrido:brawlscope-reading:v1";
export const BRAWLSCOPE_READING_EVENT = "brawl-hibrido:brawlscope-reading";

export function readBrawlScopeReading(): BrawlScopeReadingId {
  if (typeof window === "undefined") return DEFAULT_BRAWLSCOPE_READING;
  try {
    return normalizeBrawlScopeReading(window.localStorage.getItem(BRAWLSCOPE_READING_STORAGE_KEY));
  } catch {
    return DEFAULT_BRAWLSCOPE_READING;
  }
}

/**
 * Escolha entre a tabela geral do BrawlScope e as tabelas por modo. O motor
 * guarda a leitura ativa em memória, por isso a preferência é aplicada aqui e
 * o valor devolvido entra nas dependências dos cálculos do Draft.
 */
export function useBrawlScopeReading() {
  const [reading, setReading] = useState<BrawlScopeReadingId>(() => {
    const stored = readBrawlScopeReading();
    setBrawlScopeReading(stored);
    return stored;
  });

  useEffect(() => {
    const sync = () => {
      const next = readBrawlScopeReading();
      setBrawlScopeReading(next);
      setReading(next);
    };
    window.addEventListener(BRAWLSCOPE_READING_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(BRAWLSCOPE_READING_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: BrawlScopeReadingId) => {
    const normalized = normalizeBrawlScopeReading(next);
    try {
      window.localStorage.setItem(BRAWLSCOPE_READING_STORAGE_KEY, normalized);
    } catch {
      // Sessão sem armazenamento: a escolha vale para esta página.
    }
    setBrawlScopeReading(normalized);
    setReading(normalized);
    window.dispatchEvent(new Event(BRAWLSCOPE_READING_EVENT));
  }, []);

  return { reading, setReading: update };
}
