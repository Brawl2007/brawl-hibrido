import { VERSAO_DO_SITE } from "@shared/version";
import "dotenv/config";
import express from "express";
import { createServer, type Server } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { handleCounterSyncScheduled, handleRankedSyncScheduled } from "../scheduled";
import { handleCronSync } from "../cronSync";
import { handleObservedMatchCollectionScheduled } from "../observedMatchScheduled";
import { getPublicCounterSyncSnapshot } from "../counterSync";
import { getNextRefreshAt, getPublicRankedSnapshot } from "../rankedSync";
import { addCounterClient, addRankedClient } from "../realtime";
import { getLiveSyncState, startLiveSync } from "../liveSync";

export function createApp() {
  const app = express();
  const server = createServer(app);

  // Configure body parser with larger size limit for file uploads.
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
  app.post("/api/scheduled/rankedSync", handleRankedSyncScheduled);
  app.post("/api/scheduled/counterSync", handleCounterSyncScheduled);
  app.post("/api/scheduled/observedMatchCollection", handleObservedMatchCollectionScheduled);
  app.get("/api/realtime/status", (_req, res) => {
    res.json(getLiveSyncState());
  });
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
      sourceReadAt: snapshot.sourceReadAt,
      rowCount: snapshot.rowCount,
      payload: snapshot.payload,
    })}\n\n`);
    const removeClient = addRankedClient(res);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);
    res.on("close", () => {
      clearInterval(heartbeat);
      removeClient();
    });
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
    if (snapshot) {
      res.write(`event: counter_snapshot\ndata: ${JSON.stringify({ version: snapshot.version, capturedAt: snapshot.capturedAt, payload: snapshot.payload })}\n\n`);
    }
    const removeClient = addCounterClient(res);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);
    res.on("close", () => {
      clearInterval(heartbeat);
      removeClient();
    });
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Vercel serves files from the root public/ directory. The same helper also
  // remains active for the regular Render/Node deployment.
  if (process.env.NODE_ENV !== "development") {
    serveStatic(app);
  }

  return { app, server };
}

export const { app, server } = createApp();

async function startServer(currentServer: Server) {
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, currentServer);
  }

  // Vercel uses the exported Express app as a serverless function and must not
  // open a long-lived listener. Render and local Node still use PORT normally.
  if (process.env.VERCEL) return;

  const port = parseInt(process.env.PORT || "3000", 10);
  currentServer.listen(port, () => {
    console.log(`[Brawl Híbrido] Versão ${VERSAO_DO_SITE} em execução.`);
    console.log(`Server running on http://localhost:${port}/`);
    startLiveSync();
  });
}

process.on("unhandledRejection", (motivo) => {
  console.error("[Processo] Promessa rejeitada sem tratamento; o servidor continua ativo:", motivo);
});

process.on("uncaughtException", (erro) => {
  console.error("[Processo] Exceção não tratada; o servidor continua ativo:", erro);
});

if (!process.env.VERCEL) {
  startServer(server).catch((erro) => {
    console.error("[Arranque] O servidor não conseguiu arrancar:", erro);
    process.exit(1);
  });
}

export default app;

void VERSAO_DO_SITE;
