import { z } from "zod";
import { brawlScopeCaptureSchema } from "../shared/brawlScopeCapture";
import { restoreBrawlScopeMatchupMatrices, importBrawlScopeCapture, persistCaptures } from "./counterSync";

export const captureBatchSchema = z.array(brawlScopeCaptureSchema).min(1).max(20);

/**
 * Confirma um grupo de fichas coladas.
 *
 * POR QUE ISTO MUDOU
 *
 * Cada grupo gravava a snapshot inteira — a fila completa de fichas e todas as
 * matrizes, numa única linha de MySQL. Às primeiras dezenas de fichas isso eram
 * uns KB e ninguém reparava. Às setecentas eram mais de cinco megabytes, lidos,
 * desserializados, fundidos, serializados e reescritos POR CADA vinte fichas —
 * com o custo total da importação a crescer com o quadrado do número de fichas.
 *
 * O sintoma era exatamente esse: a importação corria bem quase até ao fim e
 * falhava perto do último grupo, o mais pesado de todos, com "Não foi possível
 * confirmar a gravação do grupo". Não era a base de dados a estar em baixo.
 *
 * Agora um grupo grava as suas fichas, e só as suas: vinte linhas numa tabela
 * própria. O custo de confirmar vinte fichas é o mesmo na primeira e na
 * setecentésima, e a matriz é reconstruída a partir delas no arranque.
 */
export async function saveCaptureBatch(input: unknown) {
  const profiles = captureBatchSchema.parse(input);
  await restoreBrawlScopeMatchupMatrices();
  const results = profiles.map(profile => importBrawlScopeCapture(profile));
  if (results.some(result => !result.ok)) throw new Error("Uma ficha foi recusada. O grupo não foi confirmado.");
  const persisted = await persistCaptures(profiles);
  if (!persisted.saved) throw new Error("Gravação do grupo não confirmada. Retoma quando a base estiver disponível.");
  return { ok: true as const, persisted: true as const, confirmed: results.length };
}
