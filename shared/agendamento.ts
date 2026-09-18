/**
 * O agendamento real da recolha, num sítio só.
 *
 * POR QUE ISTO EXISTE
 *
 * O painel publicava `enabled: false` e `cronExpression: "0 0 * * * *"`. As
 * duas coisas eram falsas, e cada uma à sua maneira:
 *
 * - `enabled: false` vinha de uma coluna da base que nada lê. A recolha corre
 *   na mesma, porque quem a manda correr é o cron da plataforma. Quem visse
 *   este campo concluía que a recolha estava desligada — e estava a funcionar.
 * - `"0 0 * * * *"` tem SEIS campos. Um cron tem cinco. Aquilo não era um
 *   horário errado, era um horário que não existe: sobrou da plataforma
 *   anterior, cujo agendador usava seis campos. O horário a sério está no
 *   `vercel.json`.
 *
 * Os dois campos juntos descreviam um agendador que já não existe, e faziam-no
 * com a mesma cara de quem diz a verdade. Perdi uma investigação inteira a
 * partir deles. Agora o que é publicado é o que manda de facto, e o teste em
 * `cronSync.test.ts` não deixa esta constante afastar-se do `vercel.json`.
 */

/** O que está declarado no `vercel.json`, e é o que manda. */
export const CRON_DA_RECOLHA = "0 5 * * *";

/** O mesmo horário em português, para quem não lê cron de cabeça. */
export const HORARIO_EM_PALAVRAS = "todos os dias às 05:00 UTC";

/**
 * Onde o horário vive — dito em voz alta de propósito.
 *
 * Quem procurar o agendamento numa tabela da base não o encontra, e a ausência
 * parece avaria. Dizer que ele vem do ficheiro de configuração da plataforma
 * poupa essa procura.
 */
export const FONTE_DO_AGENDAMENTO = "vercel.json (cron da plataforma)";

export const AGENDAMENTO_DA_RECOLHA = {
  cron: CRON_DA_RECOLHA,
  descricao: HORARIO_EM_PALAVRAS,
  fonte: FONTE_DO_AGENDAMENTO,
} as const;
