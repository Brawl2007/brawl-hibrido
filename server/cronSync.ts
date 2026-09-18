import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { startSyncJob, esperarPeloTrabalho } from "./syncJobs";
import { RANKED_SYNC_JOB, COUNTER_SYNC_JOB } from "./syncJobNames";
import { syncRankedData } from "./rankedSync";
import { syncCounterData } from "./counterSync";
import { garantirArranque } from "./arranque";
import { fecharExecucoesAbandonadas } from "./db";
import { setSetting } from "./appSettings";
import { RECOLHA_AUTOMATICA_SETTING, type RecolhaAutomatica } from "@shared/recolhaAutomatica";

/**
 * A recolha periódica, para um alojamento sem processo de pé.
 *
 * POR QUE ISTO EXISTE
 *
 * A recolha arrancava de duas maneiras, e na Vercel nenhuma funciona. O
 * `startLiveSync()` monta temporizadores dentro do processo — mas aqui não há
 * processo, há uma função que acorda para responder e volta a dormir, e um
 * `setInterval` de hora a hora nunca chega a disparar. Os endpoints
 * `/api/scheduled/*` existem, mas pedem autenticação do SDK da plataforma
 * anterior e ninguém os chama.
 *
 * Resultado: TopBrawl, Brawl Planet, Brawl Calculator, PL Prodigy e as
 * batalhas observadas estavam todos parados desde a mudança. O que se via era
 * o catálogo do repositório mais o que fosse importado à mão.
 *
 * Este endpoint é chamado pelo cron da Vercel, declarado no `vercel.json`.
 *
 * A DIFERENÇA QUE IMPORTA: aqui o trabalho é ESPERADO, não arrancado.
 *
 * O resto do site usa `startSyncJob` no seu feitio normal — o pedido arranca a
 * recolha e responde já, e o ecrã pergunta pelo progresso à parte. Isso supõe
 * um servidor que fica de pé a trabalhar depois de responder. Numa função, a
 * resposta CONGELA o processo: o trabalho que ficasse para trás nunca
 * terminava. Por isso esta rota espera pelo fim antes de responder.
 */

/**
 * Quanto tempo a recolha pode ocupar antes de a função ser cortada.
 *
 * O limite da plataforma são 300 segundos — apurado num erro dos registos,
 * "Task timed out after 300 seconds". Aqui ninguém está à espera de resposta,
 * por isso usa-se quase todo, com margem para a gravação final.
 */
const ORCAMENTO_MS = Number(process.env.CRON_SYNC_BUDGET_MS ?? 240_000);

/**
 * Quanto tempo tem de sobrar para valer a pena começar os counters.
 *
 * Uma recolha cortada a meio não grava nada — a função é morta sem aviso e o
 * trabalho todo é deitado fora. Começar com pouco tempo é portanto pior do que
 * não começar: gasta a recolha e não deixa resultado. Este é o mínimo abaixo do
 * qual se prefere assumir que não dá.
 */
const MINIMO_PARA_COUNTERS_MS = Number(process.env.CRON_SYNC_COUNTERS_MIN_MS ?? 120_000);

/**
 * Tempo acima do qual uma execução "a correr" já não está a correr.
 *
 * O máximo de uma função nesta plataforma são 300 segundos. Passado isso, ou
 * acabou e gravou, ou foi morta e nunca vai gravar. Com folga para o relógio
 * da base não bater certo ao segundo com o nosso.
 */
const EXECUCAO_ABANDONADA_MS = 15 * 60 * 1000;

/**
 * Comparação que não denuncia o segredo pelo tempo que demora.
 *
 * Um `===` sai no primeiro caractere diferente, e a diferença de tempo entre
 * tentativas deixa adivinhar o segredo caractere a caractere.
 */
function segredoConfere(recebido: string, esperado: string) {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Corre `tarefa` dentro do tempo que sobra, e desiste quando ele acaba.
 *
 * POR QUE A ESPERA TEM DE SER LIMITADA
 *
 * Isto olhava para o relógio UMA vez, antes de começar, e depois esperava pela
 * tarefa sem limite nenhum. O orçamento não limitava coisa nenhuma: garantia
 * apenas que uma tarefa não COMEÇAVA tarde demais.
 *
 * O que acontece a seguir não é teórico. Na recolha agendada de 18/09 às 05:01,
 * a tarefa dos mapas não voltou, esta função ficou à espera dela, e a
 * plataforma matou tudo aos 300 segundos. Uma função morta não escreve nada:
 * nem a resposta, nem o registo, nem sequer o motivo. A execução ficou gravada
 * como "a correr" durante as 24 horas seguintes, e as únicas sincronizações
 * desse dia foram as que alguém fez à mão.
 *
 * O caminho interativo já fazia isto bem — ver `arrancarEEsperar` em
 * `syncJobs.ts`, que corre a espera contra um relógio. Faltava aqui.
 *
 * A tarefa abandonada continua a correr em pano de fundo; não há como a parar.
 * Mas quem a esperava deixa de ficar preso a ela, e isso é o que interessa:
 * chega-se ao fim da função pelo nosso pé, com tempo para escrever o que se
 * passou. Uma desistência registada vale mais do que um sucesso que ninguém
 * chega a ver.
 */
async function dentroDoOrcamento<T>(
  nome: string,
  fim: number,
  tarefa: () => Promise<T>,
): Promise<{ estado: "ok" | "falhou" | "sem-tempo"; detalhe?: string; resultado?: T }> {
  const sobra = fim - Date.now();
  if (sobra <= 0) return { estado: "sem-tempo" };

  let alarme: ReturnType<typeof setTimeout> | undefined;
  const ESGOTOU = Symbol("sem-tempo");
  const relogio = new Promise<typeof ESGOTOU>((resolve) => {
    alarme = setTimeout(() => resolve(ESGOTOU), sobra);
    // Sem `unref`, este temporizador sozinho segurava o processo até ao fim.
    (alarme as unknown as { unref?: () => void })?.unref?.();
  });

  try {
    const resultado = await Promise.race([tarefa(), relogio]);
    if (resultado === ESGOTOU) {
      // Em segundos quando são segundos: "orçamento de 0s" não diz nada a ninguém.
      const quanto = sobra >= 1000 ? `${Math.round(sobra / 1000)}s` : `${sobra}ms`;
      console.error(`[Cron] ${nome} não coube no orçamento de ${quanto}; segue-se em frente sem esperar por ela.`);
      return { estado: "sem-tempo", detalhe: `não coube em ${quanto}` };
    }
    return { estado: "ok", resultado: resultado as T };
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    console.error(`[Cron] ${nome} falhou; as outras fontes continuam: ${detalhe}`);
    return { estado: "falhou", detalhe };
  } finally {
    if (alarme) clearTimeout(alarme);
  }
}

export async function handleCronSync(req: Request, res: Response) {
  const esperado = (process.env.CRON_SECRET ?? "").trim();
  if (!esperado) {
    // Sem segredo definido, qualquer pessoa podia mandar o site recolher.
    res.status(503).json({ error: "CRON_SECRET não está definido" });
    return;
  }

  const cabecalho = req.headers.authorization;
  const recebido = typeof cabecalho === "string" && cabecalho.startsWith("Bearer ")
    ? cabecalho.slice(7)
    : "";
  if (!recebido || !segredoConfere(recebido, esperado)) {
    res.status(401).json({ error: "não autorizado" });
    return;
  }

  const inicio = Date.now();
  const fim = inicio + ORCAMENTO_MS;
  await garantirArranque();

  /**
   * Antes de começar, fechar o que ficou pendurado.
   *
   * Uma execução morta a meio nunca escreve o fim dela, e fica gravada como "a
   * correr" para sempre. O painel passa a mostrar uma sincronização em curso
   * que não existe, e quem olha fica à espera em vez de ir ver o que se passou.
   */
  const fechadas = await fecharExecucoesAbandonadas(EXECUCAO_ABANDONADA_MS);
  if (fechadas) console.log(`[Cron] ${fechadas} execuções estavam marcadas como "a correr" sem ninguém a correr; fechadas como falhadas.`);

  /**
   * A rotação Ranked primeiro, e é a única que corre sempre.
   *
   * São cerca de vinte páginas com duas em paralelo, o que cabe folgadamente
   * no tempo de uma função. É também a fonte do TopBrawl, que alimenta as
   * taxas de vitória e de uso publicadas.
   *
   * O tempo máximo é o que a plataforma der: não é declarado no `vercel.json`,
   * porque num projeto com `services` a propriedade `functions` não vive no
   * topo do ficheiro e pô-la lá invalida a configuração inteira. Quem precisar
   * de apertar o orçamento usa `CRON_SYNC_BUDGET_MS`.
   */
  const ranked = await dentroDoOrcamento("Ranked", fim, async () => {
    startSyncJob(RANKED_SYNC_JOB, () => syncRankedData("scheduled"));
    await esperarPeloTrabalho(RANKED_SYNC_JOB);
  });
  const rankedMs = Date.now() - inicio;

  /**
   * Os counters passam a correr também — o motivo para não correrem já não se
   * aplica.
   *
   * A regra anterior era "centenas de páginas, minutos, não cabe". Isso era
   * verdade quando a recolha incluía o BrawlScope, que é a fonte grande. Mas o
   * `brawlscope.com` recusa pedidos vindos desta rede, tal como o TopBrawl: a
   * parte cara nem chega a acontecer aqui, falha depressa e os dados dela
   * entram pelas capturas do navegador. O que resta é o Brawl Planet e o PL
   * Prodigy, que respondem daqui, e são cerca de uma centena de páginas com
   * espaçamento de 120 ms e duas em paralelo.
   *
   * Consequência de estarem desligados: as relações de counter e as sinergias
   * do Brawl Planet só mudavam quando alguém carregasse no botão à mão. As do
   * Draft com elas.
   *
   * NÃO AFIRMO O TEMPO EXATO — não consigo medi-lo de fora desta rede. Por isso
   * o que aqui está não é uma aposta: só começa se sobrar tempo que chegue, o
   * tempo que demorou fica nos registos, e `CRON_SYNC_COUNTERS=false` desliga
   * isto sem publicar nada caso a medição mostre que não cabe.
   */
  const desligados = req.query.counters === "0" || process.env.CRON_SYNC_COUNTERS === "false";
  const tempoQueSobra = fim - Date.now();
  const counters = desligados
    ? { estado: "desligado" as const }
    : tempoQueSobra < MINIMO_PARA_COUNTERS_MS
      ? { estado: "sem-tempo" as const }
      : await dentroDoOrcamento("Counters", fim, async () => {
          startSyncJob(COUNTER_SYNC_JOB, () => syncCounterData("scheduled"));
          await esperarPeloTrabalho(COUNTER_SYNC_JOB);
        });
  const countersMs = desligados ? 0 : Date.now() - inicio - rankedMs;

  const duracaoMs = Date.now() - inicio;
  console.log(`[Cron] recolha concluída em ${duracaoMs}ms · ranked=${ranked.estado} (${rankedMs}ms) · counters=${counters.estado} (${countersMs}ms)${fechadas ? ` · ${fechadas} execuções abandonadas fechadas` : ""}`);

  /**
   * Fica por escrito, onde o site o possa ler.
   *
   * Até aqui isto ia para o corpo da resposta — que só a plataforma recebe — e
   * para o `console.log`, que obriga a ir aos registos do alojamento. Ou seja:
   * a recolha automática podia falhar todos os dias sem que o site desse um
   * único sinal. Falhou, e não deu.
   *
   * A gravação não pode derrubar a rota: se a base não responder, o que se
   * perde é o registo, e o resto da recolha já está feito e gravado.
   */
  const registo: RecolhaAutomatica = {
    comecouEm: new Date(inicio).toISOString(),
    duracaoMs,
    orcamentoMs: ORCAMENTO_MS,
    ranked: { estado: ranked.estado, duracaoMs: rankedMs, detalhe: ranked.detalhe },
    counters: { estado: counters.estado, duracaoMs: countersMs, detalhe: "detalhe" in counters ? counters.detalhe : undefined },
    execucoesFechadas: fechadas,
  };
  try {
    await setSetting(RECOLHA_AUTOMATICA_SETTING, JSON.stringify(registo));
  } catch (error) {
    console.error(`[Cron] não consegui guardar o registo da recolha: ${error instanceof Error ? error.message : String(error)}`);
  }

  res.json({ ok: true, duracaoMs, ranked: ranked.estado, rankedMs, counters: counters.estado, countersMs, execucoesFechadas: fechadas });
}
