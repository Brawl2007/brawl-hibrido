import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { upsertRankedMapCaptures } from "./db";
import { garantirArranque } from "./arranque";

/**
 * Recebe páginas do TopBrawl lidas fora do alojamento.
 *
 * POR QUE ISTO EXISTE
 *
 * O `topbrawl.com` responde 403 aos pedidos vindos daqui. Não é o pedido que
 * incomoda — o mesmo pedido funcionava na plataforma anterior, com um
 * User-Agent que se anunciava abertamente como robot. O que mudou foi a origem
 * da rede: gamas de centro de dados ficam de fora, e o alojamento novo está
 * nelas. Nenhum cabeçalho resolve isso, e tentar foi o que confirmou.
 *
 * Então a recolha muda-se para onde a porta está aberta, e o resultado entra
 * por aqui. É o mesmo desenho que o BrawlScope já obrigou a adotar, com uma
 * diferença que interessa a quem usa o site: aqui não é preciso ninguém fazer
 * nada. Quem lê as páginas é uma tarefa agendada, não uma pessoa.
 */

const linha = z.object({
  brawler: z.string().trim().min(1).max(64),
  brawlerId: z.number().int().min(0),
  topBrawlWinRate: z.number().finite().min(0).max(100).nullable(),
  topBrawlUseRate: z.number().finite().min(0).max(100).nullable(),
  topBrawlScore: z.number().finite().min(0).max(100).nullable(),
});

export const rankedImportSchema = z.object({
  format: z.literal("brawlhibrido-ranked-v1"),
  maps: z.array(z.object({
    mapId: z.string().trim().regex(/^\d{1,20}$/, "O id do mapa vem do endereço e é numérico."),
    map: z.string().trim().min(1).max(128),
    capturedAt: z.string().datetime(),
    /**
     * Uma página sem linhas não é guardada.
     *
     * Guardá-la apagaria uma leitura boa anterior e passaria por recolha feita
     * — um mapa a zeros é indistinguível de um mapa que ninguém joga, e essa
     * confusão é exatamente o que tira mapas da rotação por engano.
     */
    rows: z.array(linha).min(1).max(200),
  })).min(1).max(200),
});

function segredoConfere(recebido: string, esperado: string) {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function handleRankedImport(req: Request, res: Response) {
  const esperado = (process.env.RANKED_IMPORT_SECRET ?? "").trim();
  if (!esperado) {
    res.status(503).json({ error: "RANKED_IMPORT_SECRET não está definido" });
    return;
  }

  const cabecalho = req.headers.authorization;
  const recebido = typeof cabecalho === "string" && cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
  if (!recebido || !segredoConfere(recebido, esperado)) {
    res.status(401).json({ error: "não autorizado" });
    return;
  }

  const lido = rankedImportSchema.safeParse(req.body);
  if (!lido.success) {
    res.status(400).json({ error: "lote inválido", detalhe: lido.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`) });
    return;
  }

  await garantirArranque();
  try {
    const guardados = await upsertRankedMapCaptures(lido.data.maps.map((mapa) => ({
      mapId: mapa.mapId,
      map: mapa.map,
      capturedAt: new Date(mapa.capturedAt),
      payload: JSON.stringify(mapa.rows),
    })));
    console.log(`[RankedImport] ${guardados} mapas recebidos da recolha externa.`);
    res.json({ ok: true, mapas: guardados });
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    console.error(`[RankedImport] Gravação falhou: ${detalhe}`);
    res.status(500).json({ error: "não foi possível guardar", detalhe });
  }
}
