import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { startSyncJob, esperarPeloTrabalho } from "./syncJobs";
import { RANKED_SYNC_JOB, COUNTER_SYNC_JOB } from "./syncJobNames";
import { syncRankedData } from "./rankedSync";
import { syncCounterData } from "./counterSync";
import { garantirArranque } from "./arranque";

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

/** Quanto tempo a recolha pode ocupar antes de a função ser cortada. */
const ORCAMENTO_MS = Number(process.env.CRON_SYNC_BUDGET_MS ?? 50_000);

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

/** Corre `tarefa`, ou desiste se o orçamento de tempo já acabou. */
async function dentroDoOrcamento<T>(
  nome: string,
  fim: number,
  tarefa: () => Promise<T>,
): Promise<{ estado: "ok" | "falhou" | "sem-tempo"; detalhe?: string; resultado?: T }> {
  if (Date.now() >= fim) return { estado: "sem-tempo" };
  try {
    const resultado = await tarefa();
    return { estado: "ok", resultado };
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    console.error(`[Cron] ${nome} falhou; as outras fontes continuam: ${detalhe}`);
    return { estado: "falhou", detalhe };
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
   * A rotação Ranked primeiro, e é a única que corre sempre.
   *
   * São cerca de vinte páginas com duas em paralelo: cabe folgadamente no
   * tempo de uma função. É também a fonte do TopBrawl, que alimenta as taxas
   * de vitória e de uso publicadas.
   */
  const ranked = await dentroDoOrcamento("Ranked", fim, async () => {
    startSyncJob(RANKED_SYNC_JOB, () => syncRankedData("scheduled"));
    await esperarPeloTrabalho(RANKED_SYNC_JOB);
  });

  /**
   * Os counters só a pedido, e por um motivo prático.
   *
   * Uma recolha completa de counters são centenas de páginas espaçadas no
   * tempo — minutos. Não cabe no tempo de uma função, e cortada a meio não
   * grava nada, porque a função é morta sem aviso. Fica atrás de um sinal
   * explícito para quem tiver um plano com tempo que chegue.
   */
  const querCounters = req.query.counters === "1" || process.env.CRON_SYNC_COUNTERS === "true";
  const counters = querCounters
    ? await dentroDoOrcamento("Counters", fim, async () => {
        startSyncJob(COUNTER_SYNC_JOB, () => syncCounterData("scheduled"));
        await esperarPeloTrabalho(COUNTER_SYNC_JOB);
      })
    : { estado: "ignorado" as const };

  const duracaoMs = Date.now() - inicio;
  console.log(`[Cron] recolha concluída em ${duracaoMs}ms · ranked=${ranked.estado} · counters=${counters.estado}`);
  res.json({ ok: true, duracaoMs, ranked: ranked.estado, counters: counters.estado });
}
