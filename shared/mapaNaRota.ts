/**
 * O mapa que viaja entre páginas.
 *
 * POR QUE ISTO EXISTE
 *
 * Escolhia-se Hard Rock Mine no Início, carregava-se em «Draft» — e o Draft
 * abria em Beach Ball. O mapa escolhido vivia só no estado de cada página: ao
 * mudar de rota, perdia-se, e voltar atrás também o perdia.
 *
 * Agora o mapa vai no endereço, `?map=hard-rock-mine`. O identificador é o
 * nome em minúsculas, sem acentos nem apóstrofos — estável entre snapshots
 * (o id da Brawlify pode faltar nas antigas) e legível num link partilhado.
 *
 * QUEM VALIDA
 *
 * O catálogo ativo. Um mapa que saiu da rotação, um nome mal escrito ou um
 * endereço antigo não abrem uma página vazia: `resolverMapaDaRota` diz que o
 * pedido é desconhecido e a página cai no mapa que já mostraria, avisando.
 */

/** "Hard Rock Mine" → "hard-rock-mine"; "Belle's Rock" → "belles-rock". */
export function idDoMapaNaRota(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type MapaDaRota<T> =
  | { estado: "sem-pedido"; mapa: null; pedido: null }
  | { estado: "encontrado"; mapa: T; pedido: string }
  | { estado: "desconhecido"; mapa: null; pedido: string };

/**
 * Procura no catálogo o mapa pedido no endereço.
 *
 * Aceita o identificador (`hard-rock-mine`) e o nome tal como aparece
 * (`Hard Rock Mine`): os dois passam pela mesma normalização. Não inventa
 * nada — o que não estiver no catálogo é "desconhecido".
 */
export function resolverMapaDaRota<T extends { name: string }>(
  mapas: readonly T[],
  pedido: string | null | undefined,
): MapaDaRota<T> {
  const limpo = typeof pedido === "string" ? pedido.trim() : "";
  if (!limpo) return { estado: "sem-pedido", mapa: null, pedido: null };
  const id = idDoMapaNaRota(limpo);
  const mapa = mapas.find((candidato) => idDoMapaNaRota(candidato.name) === id);
  return mapa ? { estado: "encontrado", mapa, pedido: limpo } : { estado: "desconhecido", mapa: null, pedido: limpo };
}

/** O endereço do Draft para um mapa, com a intenção de brawler quando houver. */
export function enderecoDoDraft(mapa: { name: string } | null | undefined, brawler?: string | null): string {
  const parametros = new URLSearchParams();
  if (mapa) parametros.set("map", idDoMapaNaRota(mapa.name));
  if (brawler) parametros.set("brawler", brawler);
  const texto = parametros.toString();
  return texto ? `/draft?${texto}` : "/draft";
}
