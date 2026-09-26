/**
 * O nome no separador do browser. Era "Brawl Híbrido — Ranked intelligence" em
 * todas as páginas: com o Draft e uma ficha abertos, os dois separadores
 * diziam o mesmo.
 */
const SITE = "Brawl Híbrido";

export function tituloDaPagina(caminho: string) {
  const limpo = caminho.replace(/\/+$/, "") || "/";
  if (limpo === "/") return `${SITE} — Ranked`;
  if (limpo === "/draft") return `Draft · ${SITE}`;
  if (limpo === "/matchups") return `Matriz 1v1 · ${SITE}`;
  if (limpo === "/brawlers") return `Brawlers · ${SITE}`;
  if (limpo === "/entrar") return `Entrar · ${SITE}`;
  const ficha = limpo.match(/^\/brawlers\/([^/]+)$/);
  if (ficha) {
    let nome = ficha[1];
    try { nome = decodeURIComponent(nome); } catch { /* fica como veio */ }
    return `${nome} · ${SITE}`;
  }
  return `Página não encontrada · ${SITE}`;
}
