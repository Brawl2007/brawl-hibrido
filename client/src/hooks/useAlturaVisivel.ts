import { useEffect, useState } from "react";

/**
 * Há altura visível para fixar uma faixa ao topo?
 *
 * Lê a `visualViewport`, que no Safari do iPhone encolhe quando o teclado
 * abre (a `innerHeight` não). Com o teclado aberto num ecrã baixo, uma faixa
 * fixa taparia o campo onde se está a escrever: aí deixa de estar fixa.
 */
export function useAlturaVisivel(minimo: number) {
  const ler = () => {
    if (typeof window === "undefined") return true;
    const altura = window.visualViewport?.height ?? window.innerHeight;
    return altura >= minimo;
  };
  const [chega, setChega] = useState(ler);
  useEffect(() => {
    const atualizar = () => setChega(ler());
    const vista = window.visualViewport;
    vista?.addEventListener("resize", atualizar);
    window.addEventListener("resize", atualizar);
    return () => {
      vista?.removeEventListener("resize", atualizar);
      window.removeEventListener("resize", atualizar);
    };
  }, [minimo]);
  return chega;
}
