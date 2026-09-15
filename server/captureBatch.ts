import { z } from "zod";
import { brawlScopeCaptureSchema } from "../shared/brawlScopeCapture";
import { restoreBrawlScopeMatchupMatrices, importBrawlScopeCapture, persistMatchupMatricesNow } from "./counterSync";
export const captureBatchSchema = z.array(brawlScopeCaptureSchema).min(1).max(20);
export async function saveCaptureBatch(input: unknown) {
  const profiles = captureBatchSchema.parse(input);
  await restoreBrawlScopeMatchupMatrices();
  const results = profiles.map(profile => importBrawlScopeCapture(profile));
  if (results.some(result => !result.ok)) throw new Error("Uma ficha foi recusada. O grupo não foi confirmado.");
  const persisted = await persistMatchupMatricesNow();
  if (!persisted.saved) throw new Error("Gravação do grupo não confirmada. Retoma quando a base estiver disponível.");
  return { ok: true as const, persisted: true as const, confirmed: results.length };
}
