/**
 * O ritmo da stream de tempo real quando não há processo que fique de pé.
 *
 * POR QUE ISTO EXISTE
 *
 * A stream SSE foi escrita para um servidor que fica ligado: quem se liga é
 * guardado num `Set` em memória e a sincronização, ao terminar, empurra a
 * snapshot nova para todos. Num alojamento sem processo isso não acontece — a
 * sincronização corre noutra invocação, com a sua própria cópia do `Set`, e o
 * empurrão nunca chega a quem está à espera.
 *
 * O resultado era o pior dos dois mundos: a ligação ficava aberta até ao limite
 * de 300 segundos da plataforma, a consumir tempo de função, à espera de
 * mensagens que não podiam chegar. São dois endpoints, por isso até dez minutos
 * de função por cada visitante — o maior gasto do site, e todo ele a troco de
 * nada.
 *
 * Aí, a stream passa a entregar a snapshot e a fechar. O `retry` diz ao
 * navegador quando voltar, e é ele que decide o custo: uma invocação curta a
 * cada cinco minutos em vez de uma ligação presa cinco minutos seguidos.
 *
 * Cinco minutos são de sobra. Os dados mudam de hora a hora no melhor dos
 * casos, e quem carrega em "Atualizar agora" não espera por aqui: essa via
 * atualiza o ecrã pela consulta, não pela stream.
 */
export const INTERVALO_DE_RELIGACAO_MS = 300_000;

/**
 * Quanto se tolera sem ligação antes de dizer que se está offline.
 *
 * Tem de ser MAIOR que o intervalo de religação. Entre duas ligações o
 * navegador está legitimamente desligado — anunciar "offline" nesse intervalo
 * seria dizer que algo está mal quando está tudo a correr como previsto, e o
 * indicador passaria a piscar de cinco em cinco minutos.
 */
export const TOLERANCIA_SEM_LIGACAO_MS = INTERVALO_DE_RELIGACAO_MS + 120_000;
