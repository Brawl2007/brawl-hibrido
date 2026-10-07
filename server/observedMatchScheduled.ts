import type { Request, Response } from "express";
import { getObservedMatchCollectionConfigByTaskUid } from "./db";
import { sdk } from "./_core/sdk";
import { recolherSeForAltura } from "./observedMatchCollection";

export async function handleObservedMatchCollectionScheduled(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });

    const config = await getObservedMatchCollectionConfigByTaskUid(user.taskUid);
    if (!config || !config.enabled) return res.json({ ok: true, skipped: "orphan-or-disabled" });

    const result = await recolherSeForAltura("scheduled");
    if ("saltada" in result) return res.json(result);
    if (!result.ok) {
      return res.status(500).json({
        error: result.error,
        context: { taskUid: user.taskUid, path: req.path },
        timestamp: new Date().toISOString(),
      });
    }
    return res.json({ trigger: "scheduled", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return res.status(500).json({ error: message, context: { path: req.path }, timestamp: new Date().toISOString() });
  }
}
