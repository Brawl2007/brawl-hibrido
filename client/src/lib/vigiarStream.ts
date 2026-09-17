import { TOLERANCIA_SEM_LIGACAO_MS } from "@shared/realtimeStream";

export type EstadoDaLigacao = "connecting" | "live" | "offline";

/**
 * `EventSource.CLOSED`, escrito à mão de propósito.
 *
 * Ler a constante do construtor global obriga a que exista um `EventSource` no
 * ambiente, e isso não se verifica fora do navegador — o valor faz parte da
 * norma e não muda.
 */
const DESISTIU = 2;

/**
 * Traduz o estado do `EventSource` para o que o indicador mostra.
 *
 * Antes era direto: `onerror` significava "offline". Isso valia quando a stream
 * ficava aberta indefinidamente e só fechava por avaria. Deixou de valer: no
 * alojamento sem processo a stream entrega a snapshot e fecha de propósito
 * (ver `shared/realtimeStream.ts`), e o navegador trata cada fecho como um
 * erro antes de se religar sozinho.
 *
 * Com a leitura antiga o indicador passaria a piscar "Offline" de cinco em
 * cinco minutos com tudo a funcionar — a dizer que algo está mal exatamente
 * quando está a correr como previsto.
 *
 * Distinguem-se então os dois casos: o navegador desistiu de vez (`CLOSED`), e
 * aí é mesmo offline; ou vai voltar (`CONNECTING`), e aí espera-se por ele com
 * uma tolerância maior que o intervalo de religação. Só se a volta não chegar
 * dentro desse prazo é que há razão para alarme.
 */
export function vigiarStream(source: EventSource, dizer: (estado: EstadoDaLigacao) => void) {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const cancelar = () => {
    if (temporizador === undefined) return;
    clearTimeout(temporizador);
    temporizador = undefined;
  };

  source.onopen = () => { cancelar(); dizer("live"); };
  source.onerror = () => {
    if (source.readyState === DESISTIU) { cancelar(); dizer("offline"); return; }
    if (temporizador !== undefined) return;
    temporizador = setTimeout(() => { temporizador = undefined; dizer("offline"); }, TOLERANCIA_SEM_LIGACAO_MS);
  };

  return cancelar;
}
