/**
 * Os gadgets, poderes estelares e engrenagens que existem, com o desenho.
 *
 * PORQUÊ
 *
 * A IA escrevia builds de memória — e a memória dela tem data de corte e
 * inventa. Com a lista real de cada brawler no pedido, ela escolhe entre o que
 * existe hoje, e o servidor recusa qualquer nome que não esteja na lista. Os
 * desenhos vêm da mesma lista.
 *
 * DE ONDE
 *
 * 1. Brawlify (api.brawlify.com): nomes, ids e desenhos de tudo, engrenagens incluídas.
 * 2. Se falhar, a API oficial da Supercell (se o site tiver a chave): nomes e
 *    ids de gadgets e poderes; o desenho pelo id, no mesmo sítio da Brawlify.
 *
 * Guardado na base de dados por um dia: a lista muda com as atualizações do
 * jogo, não de hora a hora.
 */
import { getSetting, setSetting } from "./appSettings";
import { fetchOfficialBrawlers } from "./brawlStarsApi";

export type ItemDeBuild = { id: number; nome: string; imagem: string | null };
export type BuildsDoBrawler = { nome: string; gadgets: ItemDeBuild[]; poderes: ItemDeBuild[] };
export type CatalogoDeBuilds = {
  /** Por nome normalizado ("larrylawrie"). */
  brawlers: Record<string, BuildsDoBrawler>;
  engrenagens: ItemDeBuild[];
  origem: "brawlify" | "oficial";
  lidoEm: string;
};

const CHAVE = "catalogoDeBuilds:v1";
const VALIDADE_MS = 24 * 60 * 60 * 1000;
const CDN = "https://cdn.brawlify.com";
// Configurável só para testes locais; em produção é sempre a da Brawlify.
const API_DA_BRAWLIFY = (process.env.BRAWLIFY_API_BASE ?? "https://api.brawlify.com").replace(/\/$/, "");
const IDENTIFICACAO = { "user-agent": "BrawlHibrido/1.0 (catalogo de builds)", accept: "application/json" };

export const normalizarNome = (nome: string) => nome.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

/** Só desenhos do CDN da Brawlify, em https. Qualquer outro endereço fica de fora. */
export function imagemSegura(url: unknown): string | null {
  return typeof url === "string" && /^https:\/\/cdn\.brawlify\.com\/[\w\-/.]+\.(png|webp)$/.test(url) ? url : null;
}

type Bruto = Record<string, unknown>;
const lista = (valor: unknown): Bruto[] => {
  if (Array.isArray(valor)) return valor as Bruto[];
  if (valor && typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    for (const chave of ["list", "items", "brawlers", "gears"]) if (Array.isArray(objeto[chave])) return objeto[chave] as Bruto[];
  }
  return [];
};
const item = (bruto: Bruto, imagemPorId: (id: number) => string): ItemDeBuild | null => {
  const id = Number(bruto.id);
  const nome = typeof bruto.name === "string" ? bruto.name.trim() : "";
  if (!Number.isFinite(id) || !nome) return null;
  return { id, nome, imagem: imagemSegura(bruto.imageUrl) ?? imagemSegura(bruto.imageUrl2) ?? imagemSegura(imagemPorId(id)) };
};

/** Lê a resposta da Brawlify (ou da API oficial) para o formato do site. Tolerante: o que não se percebe fica de fora. */
export function lerCatalogo(brawlersBrutos: unknown, engrenagensBrutas: unknown, origem: CatalogoDeBuilds["origem"], agora = new Date()): CatalogoDeBuilds {
  const brawlers: CatalogoDeBuilds["brawlers"] = {};
  for (const bruto of lista(brawlersBrutos)) {
    const nome = typeof bruto.name === "string" ? bruto.name.trim() : "";
    if (!nome) continue;
    const gadgets = lista(bruto.gadgets).map((g) => item(g, (id) => `${CDN}/gadgets/borderless/${id}.png`)).filter((g): g is ItemDeBuild => Boolean(g));
    const poderes = lista(bruto.starPowers).map((p) => item(p, (id) => `${CDN}/star-powers/borderless/${id}.png`)).filter((p): p is ItemDeBuild => Boolean(p));
    if (gadgets.length || poderes.length) brawlers[normalizarNome(nome)] = { nome, gadgets, poderes };
  }
  const engrenagens = lista(engrenagensBrutas).map((g) => item(g, (id) => `${CDN}/gears/regular/${id}.png`)).filter((g): g is ItemDeBuild => Boolean(g));
  return { brawlers, engrenagens, origem, lidoEm: agora.toISOString() };
}

let emMemoria: CatalogoDeBuilds | null = null;

async function buscarJson(url: string, buscar: typeof fetch) {
  const resposta = await buscar(url, { headers: IDENTIFICACAO, signal: AbortSignal.timeout(15_000) });
  if (!resposta.ok) throw new Error(`${url} respondeu ${resposta.status}`);
  return resposta.json() as Promise<unknown>;
}

export async function obterCatalogo(buscar: typeof fetch = fetch, agora = new Date()): Promise<CatalogoDeBuilds | null> {
  const fresco = (c: CatalogoDeBuilds | null) => c && agora.getTime() - Date.parse(c.lidoEm) < VALIDADE_MS && Object.keys(c.brawlers).length > 0;
  if (fresco(emMemoria)) return emMemoria;
  try {
    const guardado = JSON.parse((await getSetting(CHAVE)) ?? "null") as CatalogoDeBuilds | null;
    if (fresco(guardado)) return (emMemoria = guardado);
  } catch {
    // Estragado: lê-se de novo.
  }
  let catalogo: CatalogoDeBuilds | null = null;
  try {
    const [brawlers, engrenagens] = await Promise.all([
      buscarJson(`${API_DA_BRAWLIFY}/v1/brawlers`, buscar),
      buscarJson(`${API_DA_BRAWLIFY}/v1/gears`, buscar).catch(() => null),
    ]);
    catalogo = lerCatalogo(brawlers, engrenagens, "brawlify", agora);
  } catch (erro) {
    console.warn("[Builds] Brawlify indisponível:", erro instanceof Error ? erro.message : erro);
  }
  if (!catalogo || !Object.keys(catalogo.brawlers).length) {
    const oficiais = await fetchOfficialBrawlers().catch(() => []);
    if (oficiais.length) catalogo = lerCatalogo(oficiais, catalogo?.engrenagens ?? [], "oficial", agora);
  }
  if (!catalogo || !Object.keys(catalogo.brawlers).length) return emMemoria;
  emMemoria = catalogo;
  try {
    await setSetting(CHAVE, JSON.stringify(catalogo));
  } catch {
    // Sem base de dados, fica em memória.
  }
  return catalogo;
}

/** Procura um nome dado pela IA na lista real. Aceita pequenas diferenças de escrita; nada fora da lista. */
export function acharNaLista(nome: string, itens: readonly ItemDeBuild[]) {
  const alvo = normalizarNome(nome);
  if (!alvo) return null;
  return itens.find((i) => normalizarNome(i.nome) === alvo)
    ?? itens.find((i) => alvo.length >= 4 && (normalizarNome(i.nome).includes(alvo) || alvo.includes(normalizarNome(i.nome))))
    ?? null;
}
