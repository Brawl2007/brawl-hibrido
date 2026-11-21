/**
 * Voltar do perfil de um brawler ao catálogo, no mesmo sítio.
 *
 * O endereço guarda a pesquisa e os filtros (`?q=…`); isto guarda o resto do
 * que se perdia ao voltar — a rolagem e o cartão de onde se partiu, para o foco
 * regressar a ele. Fica na sessão do navegador e é usado uma vez.
 */
const CHAVE = "brawl-hibrido:regresso-ao-catalogo:v1";

export type RegressoAoCatalogo = { endereco: string; rolagem: number; brawler: string };

export function guardarRegressoAoCatalogo(brawler: string) {
  if (typeof window === "undefined") return;
  const regresso: RegressoAoCatalogo = { endereco: `${window.location.pathname}${window.location.search}`, rolagem: window.scrollY, brawler };
  try { window.sessionStorage.setItem(CHAVE, JSON.stringify(regresso)); } catch { /* sem armazenamento: volta ao topo */ }
}

export function lerRegressoAoCatalogo(): RegressoAoCatalogo | null {
  if (typeof window === "undefined") return null;
  try {
    const valor = JSON.parse(window.sessionStorage.getItem(CHAVE) ?? "null");
    return valor && typeof valor.endereco === "string" && typeof valor.rolagem === "number" && typeof valor.brawler === "string" ? valor : null;
  } catch {
    return null;
  }
}

export function limparRegressoAoCatalogo() {
  try { window.sessionStorage.removeItem(CHAVE); } catch { /* nada a limpar */ }
}

/** O endereço do catálogo de onde se veio, para o «Voltar» do perfil. */
export function enderecoDeRegresso() {
  return lerRegressoAoCatalogo()?.endereco ?? "/brawlers";
}

/**
 * A pesquisa do catálogo aceita vários nomes separados por vírgulas — é assim
 * que se põem três brawlers lado a lado na régua do Alcance.
 */
export function filtrarPorTermos(nome: string, pesquisa: string) {
  const termos = pesquisa.split(",").map((termo) => termo.trim().toLocaleLowerCase("pt-PT")).filter(Boolean);
  if (!termos.length) return true;
  const alvo = nome.toLocaleLowerCase("pt-PT");
  return termos.some((termo) => alvo.includes(termo));
}

/**
 * O fim da régua comum: a maior faixa à vista, arredondada para cima ao bloco.
 * Todas as linhas começam no mesmo 0. Sem faixas publicadas, 11 blocos (o fim
 * da faixa mais longa do Brawl Planet).
 */
export function escalaComumDeAlcance(faixas: ReadonlyArray<{ maxTiles: number } | null>) {
  const maximos = faixas.filter((faixa): faixa is { maxTiles: number } => Boolean(faixa) && Number.isFinite(faixa!.maxTiles)).map((faixa) => faixa.maxTiles);
  return maximos.length ? Math.max(1, Math.ceil(Math.max(...maximos))) : 11;
}
