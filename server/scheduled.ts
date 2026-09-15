import type { Request, Response } from "express";
import { getCounterSyncConfigByTaskUid, getRankedSyncConfigByTaskUid } from "./db";
import { sdk } from "./_core/sdk";
import { syncRankedData } from "./rankedSync";
import { syncCounterData } from "./counterSync";

export async function handleRankedSyncScheduled(req: Request, res: Response) {
  let user;
  try {
    user = await sdk.authenticateRequest(req);
  } catch {
    return res.status(403).json({ error: "cron-only" });
  }

  try {
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const config = await getRankedSyncConfigByTaskUid(user.taskUid);
    if (!config) {
      return res.json({ ok: true, skipped: "orphan" });
    }

    const result = await syncRankedData("scheduled");
    if (!result.ok) {
      return res.status(500).json({
        error: result.error,
        context: { taskUid: user.taskUid, path: req.path },
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      ok: true,
      trigger: "scheduled",
      version: result.version,
      rowCount: result.rowCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return res.status(500).json({
      error: message,
      context: { path: req.path },
      timestamp: new Date().toISOString(),
    });
  }
}

/** Endpoint exclusivo do Heartbeat; taskUid órfão torna-se no-op seguro. */
export async function handleCounterSyncScheduled(req: Request, res: Response) {
  let user;
  try {
    user = await sdk.authenticateRequest(req);
  } catch {
    return res.status(403).json({ error: "cron-only" });
  }

  try {
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const config = await getCounterSyncConfigByTaskUid(user.taskUid);
    if (!config) {
      return res.json({ ok: true, skipped: "orphan" });
    }

    const result = await syncCounterData("scheduled");
    if (!result.ok) {
      return res.status(500).json({
        error: result.error,
        context: { taskUid: user.taskUid, path: req.path },
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      ok: true,
      trigger: "scheduled",
      version: result.version,
      relationCount: result.relationCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return res.status(500).json({
      error: message,
      context: { path: req.path },
      timestamp: new Date().toISOString(),
    });
  }
}
