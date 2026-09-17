#!/usr/bin/env node
/**
 * Lê as páginas do TopBrawl e envia-as para o site.
 *
 * POR QUE ISTO EXISTE
 *
 * O `topbrawl.com` responde 403 aos pedidos vindos do alojamento. Não é o
 * pedido que incomoda: o mesmo pedido funcionava na plataforma anterior, com um
 * User-Agent que se anunciava abertamente como robot. O que mudou foi a origem
 * da rede — gamas de centro de dados ficam de fora, e o alojamento novo está
 * nelas. Cabeçalhos de navegador foram tentados e não mudaram nada.
 *
 * Então a recolha corre noutro sítio. Isto é o que o GitHub executa: lê as
 * páginas de lá, interpreta-as com o MESMO código que o servidor usa, e envia
 * o resultado. Se esta rede também estiver bloqueada, diz-se — e a alternativa
 * é ler as páginas no navegador de quem usa o site, como o BrawlScope já
 * obriga.
 */
/**
 * Importa SÓ de `shared/`, de propósito.
 *
 * O `server/rankedSync.ts` arrasta base de dados e estado de sincronização
 * atrás; nada disso existe nem faz sentido onde isto corre, que é uma máquina
 * descartável sem acesso à base. A lista de mapas e o interpretador das páginas
 * vivem em `shared/` precisamente para poderem ser lidos dos dois lados.
 */
import { lerPaginaTopBrawl } from "../shared/topBrawlParser";
import { RANKED_MAP_SOURCES } from "../shared/rankedMaps";

const SITE = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
const SEGREDO = process.env.RANKED_IMPORT_SECRET ?? "";
const CONCORRENCIA = Number(process.env.RECOLHA_CONCORRENCIA ?? 3);
const ESPACAMENTO_MS = Number(process.env.RECOLHA_ESPACAMENTO_MS ?? 400);
const POR_ENVIO = 25;

if (!SITE || !SEGREDO) {
  console.error("Faltam SITE_URL ou RANKED_IMPORT_SECRET.");
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Um pedido de página normal, espaçado.
 *
 * O ritmo é deliberado: a fonte é pública e não nos pertence, e pedir 134
 * páginas o mais depressa possível é a diferença entre ler um site e bater à
 * porta dele.
 */
async function lerPagina(url) {
  const controlador = new AbortController();
  const alarme = setTimeout(() => controlador.abort(), 20_000);
  try {
    const resposta = await fetch(url, {
      signal: controlador.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        "Referer": "https://topbrawl.com/",
      },
    });
    if (!resposta.ok) throw new Error(`${resposta.status} ${resposta.statusText}`);
    return await resposta.text();
  } finally {
    clearTimeout(alarme);
  }
}

async function enviar(mapas) {
  const resposta = await fetch(`${SITE}/api/ranked/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SEGREDO}` },
    body: JSON.stringify({ format: "brawlhibrido-ranked-v1", maps: mapas }),
  });
  const corpo = await resposta.text();
  if (!resposta.ok) throw new Error(`O site recusou (${resposta.status}): ${corpo.slice(0, 300)}`);
  return corpo;
}

const capturedAt = new Date().toISOString();
const mapas = RANKED_MAP_SOURCES.map(([name, id]) => ({ name, id })) as { name: string; id: string }[];
const recolhidos = [];
const falhados = [];

console.log(`A ler ${mapas.length} mapas do TopBrawl…`);
for (let i = 0; i < mapas.length; i += CONCORRENCIA) {
  await Promise.all(mapas.slice(i, i + CONCORRENCIA).map(async ({ name, id }) => {
    try {
      const html = await lerPagina(`https://topbrawl.com/rankeds/${id}?rows=106`);
      const rows = lerPaginaTopBrawl(html);
      if (!rows.length) { falhados.push(`${name}: página sem linhas publicadas`); return; }
      recolhidos.push({ mapId: String(id), map: name, capturedAt, rows });
    } catch (erro) {
      falhados.push(`${name}: ${erro instanceof Error ? erro.message : "erro"}`);
    }
  }));
  await dormir(ESPACAMENTO_MS);
}

console.log(`Lidos ${recolhidos.length} mapas · ${falhados.length} falharam.`);
if (falhados.length) console.log("Primeiras falhas:\n  " + falhados.slice(0, 5).join("\n  "));

/**
 * Nada lido é falha do trabalho, não sucesso silencioso.
 *
 * Se esta rede também estiver bloqueada, é isto que o diz — e é preferível ver
 * o trabalho a vermelho do que ficar meses a achar que está tudo bem enquanto
 * os números não mexem.
 */
if (!recolhidos.length) {
  console.error("Nenhum mapa lido. Esta rede pode estar bloqueada pela fonte, tal como o alojamento.");
  process.exit(1);
}

for (let i = 0; i < recolhidos.length; i += POR_ENVIO) {
  const grupo = recolhidos.slice(i, i + POR_ENVIO);
  console.log(await enviar(grupo), `(${i + grupo.length}/${recolhidos.length})`);
}
console.log("Recolha enviada.");
