import { additionalMapAssetIds } from "@/data/additionalRankedData";
import { FUNDO_DE_MAPA } from "@/lib/imagens";

/** Ids dos mapas na Brawlify, para snapshots antigas que não trazem o id. */
export const mapAssetIds: Record<string, string> = {
  "Beach Ball": "15000143",
  "Belle's Rock": "15000368",
  "Bridge Too Far": "15000072",
  "Center Stage": "15000132",
  "Double Swoosh": "15000115",
  "Dry Season": "15000083",
  "Dueling Beetles": "15000306",
  "Flaring Phoenix": "15000440",
  "Gem Fort": "15000010",
  "Hard Rock Mine": "15000007",
  "Hideout": "15000022",
  "Hot Potato": "15000053",
  "Layer Cake": "15000082",
  "Open Business": "15000292",
  "Out in the Open": "15000548",
  "Parallel Plays": "15000293",
  "Pinball Dreams": "15000118",
  "Spiraling Out": "15001021",
  ...additionalMapAssetIds,
};

/**
 * A imagem do mapa, pelo id oficial.
 *
 * O id vem da rotação lida — é o mesmo que o TopBrawl usa em `/rankeds/<id>` e
 * o mesmo que a Brawlify usa para publicar a imagem. A tabela escrita à mão
 * fica como recurso para snapshots antigas, que não trazem o id.
 *
 * Enquanto a tabela era o único caminho, um mapa que entrava na rotação
 * aparecia sem imagem nenhuma até alguém se lembrar de a editar — e "sem
 * imagem" era indistinguível de "a fonte não publica imagem deste mapa".
 */
export function mapImageFor(map: { name: string; id?: string }) {
  const mapId = map.id ?? mapAssetIds[map.name];
  return mapId ? `https://cdn.brawlify.com/maps/regular/${mapId}.png` : FUNDO_DE_MAPA;
}

/** O id do mapa na Brawlify, ou null quando não se sabe (mapa novo numa snapshot antiga). */
export function idDoMapa(map: { name: string; id?: string }) {
  const id = map.id ?? mapAssetIds[map.name];
  return id && /^\d{5,9}$/.test(id) ? id : null;
}
