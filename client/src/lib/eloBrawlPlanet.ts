import { useCallback, useEffect, useState } from "react";
import { eloValido, type EloBrawlPlanet } from "@shared/elosBrawlPlanet";

/**
 * O elo escolhido para os números do Brawl Planet (All ranks, Diamond, Mythic,
 * Legendary). Guardado por navegador, como o peso Vitória/Uso e o equilíbrio
 * das fontes, e aplicado em todo o lado: mapas, ranking e Draft mudam juntos.
 */
export const ELO_STORAGE_KEY = "brawl-hibrido:elo-brawl-planet:v1";
export const ELO_EVENT = "brawl-hibrido:elo-brawl-planet";

export function lerElo(): EloBrawlPlanet {
  if (typeof window === "undefined") return "all";
  try {
    const guardado = window.localStorage.getItem(ELO_STORAGE_KEY);
    return eloValido(guardado) ? guardado : "all";
  } catch {
    // Sem armazenamento (janela privada, bloqueado): fica All ranks.
    return "all";
  }
}

export function useEloBrawlPlanet() {
  const [elo, setEloState] = useState<EloBrawlPlanet>(lerElo);

  useEffect(() => {
    const sincronizar = () => setEloState(lerElo());
    // O `storage` cobre outros separadores; o evento próprio cobre este.
    window.addEventListener("storage", sincronizar);
    window.addEventListener(ELO_EVENT, sincronizar);
    return () => {
      window.removeEventListener("storage", sincronizar);
      window.removeEventListener(ELO_EVENT, sincronizar);
    };
  }, []);

  const setElo = useCallback((novo: EloBrawlPlanet) => {
    setEloState(novo);
    try {
      window.localStorage.setItem(ELO_STORAGE_KEY, novo);
    } catch {
      // A escolha vale nesta visita mesmo sem a poder guardar.
    }
    window.dispatchEvent(new CustomEvent(ELO_EVENT));
  }, []);

  return { elo, setElo };
}
