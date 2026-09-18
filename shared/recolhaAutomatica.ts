/**
 * O que a recolha automática fez da última vez.
 *
 * POR QUE ISTO EXISTE
 *
 * A recolha das 05:00 falhou e ninguém soube. Ficou gravada como "a correr",
 * com zero linhas, e assim ficou o dia inteiro. As sincronizações que
 * funcionaram nesse dia foram todas manuais — alguém a carregar no botão.
 *
 * O cron já media tudo o que era preciso saber: quanto tempo levou cada fonte,
 * qual falhou, quantas execuções mortas encontrou. E mandava isso para dois
 * sítios que ninguém lê: o corpo da resposta HTTP (a que só a plataforma
 * responde) e o `console.log` (que exige ir aos registos do alojamento).
 *
 * Um sistema que corre sozinho tem de deixar por escrito o que fez, no sítio
 * onde a pessoa já olha. Senão a diferença entre "correu bem" e "morreu a meio"
 * é invisível — e foi.
 */

/** Chave em `app_settings`. */
export const RECOLHA_AUTOMATICA_SETTING = "ultimaRecolhaAutomatica";

export type EstadoDaParte = "ok" | "falhou" | "sem-tempo" | "desligado";

export type RecolhaAutomatica = {
  /** Quando o cron arrancou. */
  comecouEm: string;
  /** Quanto tempo levou, do princípio ao fim. */
  duracaoMs: number;
  /** O orçamento que estava em vigor, para o tempo gasto ter escala. */
  orcamentoMs: number;
  ranked: { estado: EstadoDaParte; duracaoMs: number; detalhe?: string };
  counters: { estado: EstadoDaParte; duracaoMs: number; detalhe?: string };
  /** Execuções que estavam marcadas como "a correr" sem ninguém a correr. */
  execucoesFechadas: number;
};

/** Lê o que está guardado, sem confiar no que lá está. */
export function lerRecolhaAutomatica(bruto: string | null | undefined): RecolhaAutomatica | null {
  if (!bruto) return null;
  try {
    const lido = JSON.parse(bruto) as RecolhaAutomatica;
    if (typeof lido?.comecouEm !== "string" || Number.isNaN(new Date(lido.comecouEm).getTime())) return null;
    if (!lido.ranked || !lido.counters) return null;
    return lido;
  } catch {
    return null;
  }
}

/**
 * A frase que o ecrã mostra. Devolve `null` quando não há nada a assinalar —
 * uma recolha que correu bem não precisa de dizer nada.
 */
export function avisoDaRecolha(recolha: RecolhaAutomatica | null): string | null {
  if (!recolha) return null;
  const quando = new Date(recolha.comecouEm).toLocaleString("pt-PT", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
  const segundos = (ms: number) => `${Math.round(ms / 1000)}s`;

  if (recolha.ranked.estado === "sem-tempo") {
    return `A recolha automática de ${quando} não coube no tempo: os mapas levaram ${segundos(recolha.ranked.duracaoMs)} de um orçamento de ${segundos(recolha.orcamentoMs)}. Os números que estás a ver são os da recolha anterior.`;
  }
  if (recolha.ranked.estado === "falhou") {
    return `A recolha automática de ${quando} falhou nos mapas${recolha.ranked.detalhe ? `: ${recolha.ranked.detalhe}` : "."} Os números que estás a ver são os da recolha anterior.`;
  }
  if (recolha.counters.estado === "sem-tempo") {
    return `A recolha automática de ${quando} fez os mapas (${segundos(recolha.ranked.duracaoMs)}) mas não sobrou tempo para os counters. As relações do Draft são as da recolha anterior.`;
  }
  if (recolha.counters.estado === "falhou") {
    return `A recolha automática de ${quando} fez os mapas mas falhou nos counters${recolha.counters.detalhe ? `: ${recolha.counters.detalhe}` : "."}`;
  }
  return null;
}
