import { z } from "zod";
import { upsertRankedMapCaptures } from "./db";
import { garantirArranque } from "./arranque";
import { lerPaginaTopBrawl } from "../shared/topBrawlParser";
import { parseRankedRotationIndex } from "@shared/rankedRotationSource";
import { ROTACAO_GUARDADA_SETTING, type RotacaoGuardada } from "@shared/rotacaoGuardada";
import { setSetting } from "./appSettings";
import { avisoDeVersao } from "@shared/versaoDaExtensao";

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
  /**
   * A versão da extensão que produziu este ficheiro.
   *
   * Opcional porque as versões anteriores à v97 não a enviam — e a ausência é,
   * ela própria, a resposta: foi uma extensão antiga. Ver
   * `shared/versaoDaExtensao.ts`.
   */
  extensao: z.string().trim().max(32).optional(),
  maps: z.array(z.object({
    mapId: z.string().trim().regex(/^\d{1,20}$/, "O id do mapa vem do endereço e é numérico."),
    map: z.string().trim().min(1).max(128),
    capturedAt: z.string().datetime(),
    /** O conteúdo das etiquetas de script, onde a página guarda os números. */
    scripts: z.string().min(1).max(8_000_000),
  })).max(40).default([]),
  /**
   * O índice da rotação, quando a extensão o leu.
   *
   * É ele que diz QUAIS são os mapas de agora. Sem esta leitura, o site fica
   * preso à lista escrita à mão no projeto — e quando a Supercell muda a
   * rotação, continua a pedir os mapas que saíram e nunca pede os que
   * entraram. Foi exatamente o que aconteceu.
   */
  rotation: z.object({
    capturedAt: z.string().datetime(),
    html: z.string().min(1).max(4_000_000),
  }).optional(),
}).refine((entrada) => entrada.maps.length > 0 || Boolean(entrada.rotation), {
  message: "O ficheiro não traz mapas nem rotação.",
});

export type RankedPaginas = z.infer<typeof rankedPaginasSchema>;

export async function guardarPaginasRanked(entrada: RankedPaginas) {
  await garantirArranque();

  /**
   * A rotação primeiro, porque é ela que decide o resto.
   *
   * Guardada mesmo quando não vierem mapas: a leitura do índice sozinha já
   * corrige a fila da próxima passagem, e é isso que tira este problema do
   * calendário de alguém.
   */
  const avisoDeExtensao = avisoDeVersao(entrada.extensao);
  if (avisoDeExtensao) console.warn(`[RankedImport] ${avisoDeExtensao}`);
  let rotacao: { mapas: number; capturedAt: string } | null = null;
  /** A rotação foi tentada, mesmo que a leitura não tenha servido. */
  let rotacaoTentada = false;
  if (entrada.rotation) {
    rotacaoTentada = true;
    const lida = parseRankedRotationIndex(entrada.rotation.html);
    if (!lida.complete) {
      /**
       * Uma leitura implausível NÃO substitui o que está guardado.
       *
       * Um parser partido lê zero mapas, e zero mapas tomado por verdade
       * significa "a rotação acabou" — o site apagaria a rotação inteira por
       * causa de uma mudança de formato na fonte.
       */
      console.warn(`[RankedImport] Índice da rotação com apenas ${lida.maps.length} mapas: leitura ignorada, a rotação guardada mantém-se.`);
    } else {
      const guardada: RotacaoGuardada = { maps: lida.maps, capturedAt: entrada.rotation.capturedAt };
      await setSetting(ROTACAO_GUARDADA_SETTING, JSON.stringify(guardada));
      rotacao = { mapas: lida.maps.length, capturedAt: entrada.rotation.capturedAt };
      console.log(`[RankedImport] Rotação atualizada pela extensão: ${lida.maps.length} mapas.`);
    }
  }

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
    // Uma importação só com a rotação é válida: corrige a fila seguinte.
    if (rotacao) return { ok: true as const, mapas: 0, recusados, rotacao, avisoDeExtensao };
    /**
     * Rotação tentada e recusada, sem mapas: nada se perdeu, mas também nada
     * mudou — e a mensagem tem de dizer isso, e não "nenhuma página deu
     * linhas", que aponta para o lado errado e faz procurar um problema nos
     * mapas quando o problema está no índice.
     */
    if (rotacaoTentada) {
      throw new Error("O índice da rotação não trouxe mapas suficientes para ser credível; a rotação anterior manteve-se. Corre a fila outra vez com a página do índice aberta.");
    }
    throw new Error(`Nenhuma página deu linhas reconhecíveis. ${recusados.slice(0, 3).join(" | ")}`);
  }

  const total = await upsertRankedMapCaptures(guardar);
  console.log(`[RankedImport] ${total} mapas guardados da extensão · ${recusados.length} recusados.`);
  return { ok: true as const, mapas: total, recusados, rotacao, avisoDeExtensao };
}
