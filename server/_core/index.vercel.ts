import { VERSAO_DO_SITE } from "@shared/version";
import { INTERVALO_DE_RELIGACAO_MS } from "@shared/realtimeStream";
import "dotenv/config";
import { registarImagensDaBrawlify } from "./imagensDaBrawlify";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./static";
import { handleCounterSyncScheduled, handleRankedSyncScheduled } from "../scheduled";
import { handleCronSync } from "../cronSync";
import { handleObservedMatchCollectionScheduled } from "../observedMatchScheduled";
import { getPublicCounterSyncSnapshot } from "../counterSync";
import { getNextRefreshAt, getPublicRankedSnapshot } from "../rankedSync";
import { getLiveSyncState } from "../liveSync";
import { garantirArranque } from "../arranque";

/**
 * O navegador já tem esta versão?
 *
 * A snapshot dos counters pesa cerca de 5,4 MB, e o cliente JÁ a busca por
 * `counterSync.snapshot`. A stream entregava-a outra vez: ao abrir a página
 * eram 5,4 MB a dobrar, e depois mais 5,4 MB a cada religação, de cinco em
 * cinco minutos — dezenas de megabytes por visitante para repetir dados que
 * não mudaram.
 *
 * O protocolo SSE já resolve isto. O servidor marca cada evento com `id:`, e o
 * navegador devolve essa marca em `Last-Event-ID` quando se religa. Se a marca
 * for a versão que está publicada, não há nada de novo a dizer: fecha-se sem
 * corpo, e o cliente fica com o que já tinha.
 *
 * Quando a versão muda, o `Last-Event-ID` deixa de bater certo e a snapshot
 * segue por inteiro, como antes.
 */
function versaoJaConhecida(req: { headers: Record<string, unknown> }, versao: string | undefined) {
  const recebido = req.headers["last-event-id"];
  const marca = Array.isArray(recebido) ? recebido[0] : recebido;
  return Boolean(versao) && typeof marca === "string" && marca === versao;
}

export function createApp() {
  const app = express();
  const server = createServer(app);

  /**
   * Sem processo que fique de pé, o trabalho de arranque viaja no primeiro
   * pedido que cada instância atender: criar as tabelas em falta e carregar a
   * chave da API guardada. É memorizado, por isso os pedidos seguintes desta
   * instância não pagam nada.
   */
  app.use((_req, _res, next) => { void garantirArranque().finally(() => next()); });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  /**
   * A recolha periódica do cron da Vercel, declarada no `vercel.json`.
   *
   * As rotas `/api/scheduled/*` abaixo são da plataforma anterior: pedem
   * autenticação do SDK dela e ninguém as chama desde a mudança. Esta é a que
   * funciona aqui, protegida pelo `CRON_SECRET`.
   */
  app.get("/api/cron/sync", handleCronSync);
  registarImagensDaBrawlify(app);
  app.post("/api/scheduled/rankedSync", handleRankedSyncScheduled);
  app.post("/api/scheduled/counterSync", handleCounterSyncScheduled);
  app.post("/api/scheduled/observedMatchCollection", handleObservedMatchCollectionScheduled);
  app.get("/api/realtime/status", (_req, res) => res.json(getLiveSyncState()));
  app.get("/api/realtime/ranked", async (req, res) => {
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    // Quando voltar. Sem isto o navegador religa-se em ~3 s, o que trocaria uma
    // ligação presa por uma chuva de invocações — pior do que o problema.
    res.write(`retry: ${INTERVALO_DE_RELIGACAO_MS}\n\n`);
    let disconnected = false;
    res.once("close", () => { disconnected = true; });
    const snapshot = await getPublicRankedSnapshot();
    if (disconnected) return;
    // Já tem esta versão: não se reenvia a snapshot inteira. Ver `versaoJaConhecida`.
    if (versaoJaConhecida(req, snapshot.version)) return void res.end();
    const capturedAt = snapshot.capturedAt ? new Date(snapshot.capturedAt) : null;
    res.write(`id: ${snapshot.version}\nevent: ranked_snapshot\ndata: ${JSON.stringify({
      version: snapshot.version,
      capturedAt: snapshot.capturedAt,
      syncState: snapshot.version === "bundled-static" ? "bundled" : "success",
      nextRefreshAt: getNextRefreshAt(capturedAt)?.toISOString() ?? null,
      sourceStatus: snapshot.sourceStatus,
      sourceNotes: snapshot.sourceNotes,
      sourceReadAt: snapshot.sourceReadAt,
      rowCount: snapshot.rowCount,
      payload: snapshot.payload,
    })}\n\n`);
    /**
     * Entregue o que havia, a ligação fecha.
     *
     * Guardar a resposta para empurrar mais tarde é o que o servidor de pé faz,
     * e aqui não pode funcionar: a sincronização corre noutra invocação, com
     * outra cópia da lista de ligados. Ficar à espera só consumia tempo de
     * função. Ver `shared/realtimeStream.ts`.
     */
    res.end();
  });
  app.get("/api/realtime/counters", async (req, res) => {
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    // Quando voltar. Sem isto o navegador religa-se em ~3 s, o que trocaria uma
    // ligação presa por uma chuva de invocações — pior do que o problema.
    res.write(`retry: ${INTERVALO_DE_RELIGACAO_MS}\n\n`);
    let disconnected = false;
    res.once("close", () => { disconnected = true; });
    const snapshot = await getPublicCounterSyncSnapshot();
    if (disconnected) return;
    if (snapshot && !versaoJaConhecida(req, snapshot.version)) {
      res.write(`id: ${snapshot.version}\nevent: counter_snapshot\ndata: ${JSON.stringify({ version: snapshot.version, capturedAt: snapshot.capturedAt, payload: snapshot.payload })}\n\n`);
    }
    res.end();
  });
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  serveStatic(app);
  return { app, server };
}

export const { app, server } = createApp();

if (!process.env.VERCEL) {
  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, () => {
    console.log(`[Brawl Híbrido] Versão ${VERSAO_DO_SITE} em execução.`);
    console.log(`Server running on http://localhost:${port}/`);
  });
}

process.on("unhandledRejection", (motivo) => console.error("[Processo] Promessa rejeitada sem tratamento; o servidor continua ativo:", motivo));
process.on("uncaughtException", (erro) => console.error("[Processo] Exceção não tratada; o servidor continua ativo:", erro));

export default app;
void VERSAO_DO_SITE;
