import { VERSAO_DO_SITE } from "@shared/version";
import "dotenv/config";
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
import { handleRankedImport } from "../rankedImport";
import { handleObservedMatchCollectionScheduled } from "../observedMatchScheduled";
import { getPublicCounterSyncSnapshot } from "../counterSync";
import { getNextRefreshAt, getPublicRankedSnapshot } from "../rankedSync";
import { addCounterClient, addRankedClient } from "../realtime";
import { getLiveSyncState } from "../liveSync";
import { garantirArranque } from "../arranque";

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

  /**
   * A recolha do TopBrawl feita fora, porque daqui responde 403.
   * Protegida por `RANKED_IMPORT_SECRET`, como o cron.
   */
  app.post("/api/ranked/import", handleRankedImport);
  app.post("/api/scheduled/rankedSync", handleRankedSyncScheduled);
  app.post("/api/scheduled/counterSync", handleCounterSyncScheduled);
  app.post("/api/scheduled/observedMatchCollection", handleObservedMatchCollectionScheduled);
  app.get("/api/realtime/status", (_req, res) => res.json(getLiveSyncState()));
  app.get("/api/realtime/ranked", async (_req, res) => {
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    let disconnected = false;
    res.once("close", () => { disconnected = true; });
    const snapshot = await getPublicRankedSnapshot();
    if (disconnected) return;
    const capturedAt = snapshot.capturedAt ? new Date(snapshot.capturedAt) : null;
    res.write(`event: ranked_snapshot\ndata: ${JSON.stringify({
      version: snapshot.version,
      capturedAt: snapshot.capturedAt,
      syncState: snapshot.version === "bundled-static" ? "bundled" : "success",
      nextRefreshAt: getNextRefreshAt(capturedAt)?.toISOString() ?? null,
      sourceStatus: snapshot.sourceStatus,
      sourceNotes: snapshot.sourceNotes,
      rowCount: snapshot.rowCount,
      payload: snapshot.payload,
    })}\n\n`);
    const removeClient = addRankedClient(res);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);
    res.on("close", () => { clearInterval(heartbeat); removeClient(); });
  });
  app.get("/api/realtime/counters", async (_req, res) => {
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    let disconnected = false;
    res.once("close", () => { disconnected = true; });
    const snapshot = await getPublicCounterSyncSnapshot();
    if (disconnected) return;
    if (snapshot) res.write(`event: counter_snapshot\ndata: ${JSON.stringify({ version: snapshot.version, capturedAt: snapshot.capturedAt, payload: snapshot.payload })}\n\n`);
    const removeClient = addCounterClient(res);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);
    res.on("close", () => { clearInterval(heartbeat); removeClient(); });
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
