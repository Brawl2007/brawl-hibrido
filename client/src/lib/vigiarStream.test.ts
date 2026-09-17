import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOLERANCIA_SEM_LIGACAO_MS, INTERVALO_DE_RELIGACAO_MS } from "@shared/realtimeStream";
import { vigiarStream, type EstadoDaLigacao } from "./vigiarStream";

/** O mínimo do EventSource que o vigilante toca. */
function streamFalso(readyState: number) {
  const fake = { readyState, onopen: null as null | (() => void), onerror: null as null | (() => void) };
  return fake as unknown as EventSource & typeof fake;
}

describe("vigiar a stream de snapshots", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("não diz offline enquanto o navegador ainda vai religar", () => {
    const estados: EstadoDaLigacao[] = [];
    const source = streamFalso(0 /* CONNECTING */);
    vigiarStream(source, (estado) => estados.push(estado));

    source.onopen?.();
    source.onerror?.(); // fecho normal da stream: a religação está agendada

    vi.advanceTimersByTime(INTERVALO_DE_RELIGACAO_MS);
    expect(estados).toEqual(["live"]);

    source.onopen?.(); // religou dentro do prazo
    vi.advanceTimersByTime(TOLERANCIA_SEM_LIGACAO_MS * 2);
    expect(estados).toEqual(["live", "live"]);
  });

  it("diz offline quando a volta não chega dentro da tolerância", () => {
    const estados: EstadoDaLigacao[] = [];
    const source = streamFalso(0 /* CONNECTING */);
    vigiarStream(source, (estado) => estados.push(estado));

    source.onopen?.();
    source.onerror?.();

    vi.advanceTimersByTime(TOLERANCIA_SEM_LIGACAO_MS);
    expect(estados).toEqual(["live", "offline"]);
  });

  it("diz offline de imediato quando o navegador desistiu de vez", () => {
    const estados: EstadoDaLigacao[] = [];
    const source = streamFalso(2 /* CLOSED */);
    vigiarStream(source, (estado) => estados.push(estado));

    source.onerror?.();
    expect(estados).toEqual(["offline"]);
  });

  it("a tolerância é maior que o intervalo de religação", () => {
    // Se não fosse, o indicador piscaria offline a cada ciclo com tudo bem.
    expect(TOLERANCIA_SEM_LIGACAO_MS).toBeGreaterThan(INTERVALO_DE_RELIGACAO_MS);
  });
});
