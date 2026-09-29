import { useCallback, useEffect, useRef, useState } from "react";
import { comandarLeitor, leitorParado, passoNoInstante, type ComandoDoLeitor, type EstadoDoLeitor, type TimelineTatica } from "@shared/timelineTatica";

/** Quantas vezes por segundo o relógio da simulação chega ao React: os passos duram segundos, não é preciso mais. */
const ATUALIZACOES_POR_SEGUNDO = 6;

/** prefers-reduced-motion, a seguir as mudanças do sistema. */
function useMovimentoReduzido() {
  const consulta = "(prefers-reduced-motion: reduce)";
  const [reduzido, setReduzido] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(consulta).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const lista = window.matchMedia(consulta);
    const mudou = () => setReduzido(lista.matches);
    lista.addEventListener?.("change", mudou);
    return () => lista.removeEventListener?.("change", mudou);
  }, []);
  return reduzido;
}

/**
 * O leitor da timeline tática: tocar, pausar, reiniciar e velocidade, com o
 * relógio em requestAnimationFrame. O estado é o redutor puro de
 * `@shared/timelineTatica` (testado sem ecrã); aqui só se lhe dá o tempo.
 */
export function useSimulacaoTatica(timeline: TimelineTatica | null) {
  const [leitor, setLeitor] = useState<EstadoDoLeitor>(() => leitorParado());
  const atual = useRef(leitor);
  atual.current = leitor;
  const movimentoReduzido = useMovimentoReduzido();

  const comandar = useCallback((comando: ComandoDoLeitor) => setLeitor((estado) => comandarLeitor(estado, comando)), []);

  // Outra estratégia: o leitor volta ao princípio, parado.
  useEffect(() => { setLeitor((estado) => leitorParado(estado.velocidade)); }, [timeline]);

  useEffect(() => {
    if (!leitor.tocando || !timeline) return;
    let quadro = 0;
    let ultimo = performance.now();
    let acumulado = 0;
    const ciclo = (agora: number) => {
      acumulado += (agora - ultimo) / 1000;
      ultimo = agora;
      if (acumulado >= 1 / ATUALIZACOES_POR_SEGUNDO) {
        const dtS = acumulado;
        acumulado = 0;
        setLeitor((estado) => comandarLeitor(estado, { tipo: "avancar", dtS, duracaoS: timeline.duracaoS }));
      }
      quadro = requestAnimationFrame(ciclo);
    };
    quadro = requestAnimationFrame(ciclo);
    return () => cancelAnimationFrame(quadro);
  }, [leitor.tocando, timeline]);

  const indice = timeline ? passoNoInstante(timeline, leitor.tempoS) : 0;
  return { leitor, comandar, indice, passo: timeline?.passos[indice] ?? null, movimentoReduzido };
}
