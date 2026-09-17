import { z } from "zod";
import { upsertRankedMapCaptures } from "./db";
import { garantirArranque } from "./arranque";
import { lerPaginaTopBrawl } from "../shared/topBrawlParser";

/**
 * As páginas do TopBrawl, tal como a extensão as traz.
 *
 * POR QUE PASSAM PELA EXTENSÃO
 *
 * O `topbrawl.com` responde 403 a pedidos vindos de alojamentos na nuvem. Foram
 * testadas duas redes diferentes — a do site e a dos servidores do GitHub — e
 * ambas levaram 403, com os mesmos cabeçalhos que um navegador envia. O que
 * fica de fora é a origem da rede, não o pedido: o MESMO pedido funcionava na
 * plataforma onde o site esteve antes.
 *
 * No navegador de quem usa o site as mesmas páginas abrem sem problema. É de lá
 * que passam a ser lidas.
 *
 * POR QUE O TEXTO VEM CRU
 *
 * Interpretá-lo no navegador significaria duas leituras da mesma página — uma
 * na extensão, outra aqui — e quando a fonte mudasse o formato uma ficaria para
 * trás sem ninguém dar por isso: os números continuariam a aparecer, só que
 * errados. Assim há um interpretador só, e é este.
 */
export const rankedPaginasSchema = z.object({
  format: z.literal("brawlhibrido-ranked-paginas-v1"),
  maps: z.array(z.object({
    mapId: z.string().trim().regex(/^\d{1,20}$/, "O id do mapa vem do endereço e é numérico."),
    map: z.string().trim().min(1).max(128),
    capturedAt: z.string().datetime(),
    /** O conteúdo das etiquetas de script, onde a página guarda os números. */
    scripts: z.string().min(1).max(8_000_000),
  })).min(1).max(30),
});

export type RankedPaginas = z.infer<typeof rankedPaginasSchema>;

export async function guardarPaginasRanked(entrada: RankedPaginas) {
  await garantirArranque();

  const guardar: { mapId: string; map: string; capturedAt: Date; payload: string }[] = [];
  const recusados: string[] = [];
  for (const pagina of entrada.maps) {
    const linhas = lerPaginaTopBrawl(pagina.scripts);
    /**
     * Uma página sem linhas não é guardada.
     *
     * Guardá-la apagaria uma leitura boa anterior e passaria por recolha feita.
     * Um mapa a zeros é indistinguível de um mapa que ninguém joga, e é assim
     * que se tiram mapas da rotação por engano.
     */
    if (!linhas.length) { recusados.push(`${pagina.map}: nenhuma linha reconhecida`); continue; }
    guardar.push({ mapId: pagina.mapId, map: pagina.map, capturedAt: new Date(pagina.capturedAt), payload: JSON.stringify(linhas) });
  }

  if (!guardar.length) {
    throw new Error(`Nenhuma página deu linhas reconhecíveis. ${recusados.slice(0, 3).join(" | ")}`);
  }

  const total = await upsertRankedMapCaptures(guardar);
  console.log(`[RankedImport] ${total} mapas guardados da extensão · ${recusados.length} recusados.`);
  return { ok: true as const, mapas: total, recusados };
}
