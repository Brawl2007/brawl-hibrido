/**
 * Recolhe a tabela "Every matchup" de cada brawler, por modo, e escreve
 * `shared/brawlScopeMatchupsByMode.generated.ts`.
 *
 * Cada linha publicada tem a forma «NOME  A% vs B% usual · N battles  +D», onde
 * A é a taxa de vitória do adversário naquele confronto, B a média habitual dele
 * e D o delta. Isso dá dois controlos automáticos:
 *
 *   1. por linha:   A − D tem de dar B (o valor impresso na própria linha);
 *   2. por modo:    o B de um adversário é uma propriedade dele, por isso tem de
 *                   ser o mesmo em todas as fichas do mesmo modo.
 *
 * Linhas que falhem o primeiro controlo são descartadas; o segundo é reportado
 * no fim como desvio máximo, para se ver de relance se a recolha é coerente.
 *
 * Uso:
 *   node server/scripts/import-brawlscope-matchups.mjs --mode=knockout
 *   node server/scripts/import-brawlscope-matchups.mjs            (os seis modos)
 *   node server/scripts/import-brawlscope-matchups.mjs --dry-run
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OUTPUT_PATH = path.resolve("shared/brawlScopeMatchupsByMode.generated.ts");
const DELTAS_PATH = path.resolve("shared/brawlScopeMatchupDeltas.generated.ts");
const BASE_URL = "https://brawlscope.com";
const MODES = ["gemGrab", "brawlBall", "knockout", "heist", "hotZone", "bounty"];
const MAX_CONCURRENCY = 6;
const TIMEOUT_MS = 20_000;
const TOLERANCIA = 0.15;

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const modosPedidos = args.get("mode") ? [args.get("mode")] : MODES;
const dryRun = args.get("dry-run") === "true";

function decodeHtml(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}
const textContent = (value) => decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "BrawlHibrido/1.0 (public matchup importer)" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      try { results[index] = { ok: true, value: await worker(items[index]) }; }
      catch (error) { results[index] = { ok: false, error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

/** Slugs conhecidos, retirados do catálogo geral já presente no projeto. */
async function lerRoster() {
  const source = await readFile(DELTAS_PATH, "utf8");
  const obj = JSON.parse(source.slice(source.indexOf("{", source.indexOf("=")), source.lastIndexOf("}") + 1));
  return Object.keys(obj).map((nome) => ({
    nome,
    slug: nome.toLowerCase().replace(/&/g, "").replace(/\./g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  }));
}

/** Lê a tabela completa da ficha, validando cada linha pelo checksum impresso. */
export function parseEveryMatchup(pageHtml, roster) {
  const conhecidos = new Map(roster.map((entry) => [entry.nome.toLowerCase().replace(/[^a-z0-9]+/g, ""), entry.nome]));
  const linhas = [];
  const descartadas = [];
  const bloco = pageHtml.replace(/\\"/g, '"');
  const padrao = /<a[^>]*href=["']\/counters\/([^"'?]+)(?:\?[^"']*)?["'][^>]*>([\s\S]{0,400}?)<\/a>/gi;
  for (const match of bloco.matchAll(padrao)) {
    const texto = textContent(match[2]);
    const numeros = texto.match(/(\d+(?:\.\d+)?)%\s*vs\s*(\d+(?:\.\d+)?)%[\s\S]*?([+−-]\s*\d+(?:\.\d+)?)/);
    if (!numeros) continue;
    const nomeBruto = texto.replace(/\d.*/, "").trim();
    const chave = nomeBruto.toLowerCase().replace(/[^a-z0-9]+/g, "") || decodeURIComponent(match[1]).replace(/-/g, "");
    const nome = conhecidos.get(chave);
    if (!nome) { descartadas.push(`${nomeBruto}: fora do roster`); continue; }
    const taxa = Number(numeros[1]);
    const media = Number(numeros[2]);
    const delta = Number(numeros[3].replace(/[−]/, "-").replace(/\s+/g, ""));
    if (Math.abs(taxa - media - delta) > TOLERANCIA) { descartadas.push(`${nome}: ${taxa} − ${media} ≠ ${delta}`); continue; }
    linhas.push({ nome, delta, taxa, media });
  }
  return { linhas, descartadas };
}

function serialize(porModo) {
  const corpo = Object.entries(porModo).map(([modo, perfis]) => {
    const entradas = Object.entries(perfis).map(([nome, perfil]) =>
      `    ${JSON.stringify(nome)}: { sourceUrl: ${JSON.stringify(perfil.sourceUrl)}, deltas: { ` +
      Object.entries(perfil.deltas).map(([foe, delta]) => `${JSON.stringify(foe)}: ${delta}`).join(", ") + " } },").join("\n");
    return `  ${modo}: {\n${entradas}\n  },`;
  }).join("\n");

  return `/*
 * AUTO-GERADO das fichas públicas do BrawlScope, vista por modo, patente Lendário+.
 * Gerado em: ${new Date().toISOString()}
 * Reexecutar com: node server/scripts/import-brawlscope-matchups.mjs
 *
 * Cada delta está na perspetiva da FONTE: positivo significa que o adversário leva
 * vantagem sobre o titular da ficha. Cada linha foi validada pelo checksum impresso
 * na própria página (taxa do par − delta = média do adversário).
 */
export type BrawlScopeModeMatchups = Record<string, { sourceUrl: string; deltas: Record<string, number> }>;

export const brawlScopeMatchupsByMode: Record<string, BrawlScopeModeMatchups> = {
${corpo}
};

/** Quantos perfis cada modo já tem recolhidos. */
export function brawlScopeModeCoverage(): Record<string, number> {
  return Object.fromEntries(
    Object.entries(brawlScopeMatchupsByMode).map(([mode, profiles]) => [mode, Object.keys(profiles).length]),
  );
}
`;
}

async function main() {
  const roster = await lerRoster();
  const porModo = Object.fromEntries(MODES.map((modo) => [modo, {}]));

  for (const modo of modosPedidos) {
    const resultados = await mapWithConcurrency(roster, MAX_CONCURRENCY, async ({ nome, slug }) => {
      const sourceUrl = `${BASE_URL}/counters/${encodeURIComponent(slug)}?mode=${modo}`;
      const { linhas, descartadas } = parseEveryMatchup(await fetchText(sourceUrl), roster);
      return { nome, sourceUrl, linhas, descartadas };
    });

    const lidos = resultados.filter((r) => r.ok && r.value.linhas.length).map((r) => r.value);
    for (const perfil of lidos) {
      porModo[modo][perfil.nome] = {
        sourceUrl: perfil.sourceUrl,
        deltas: Object.fromEntries(perfil.linhas.map((linha) => [linha.nome, linha.delta])),
      };
    }

    // Controlo cruzado: a média de um adversário é a mesma em todas as fichas do modo.
    const medias = new Map();
    for (const perfil of lidos) for (const linha of perfil.linhas) {
      const lista = medias.get(linha.nome) ?? [];
      lista.push(linha.media);
      medias.set(linha.nome, lista);
    }
    const desvios = Array.from(medias.entries()).map(([nome, valores]) => ({ nome, amplitude: Math.max(...valores) - Math.min(...valores) }));
    const pior = desvios.sort((a, b) => b.amplitude - a.amplitude)[0];
    const descartadas = lidos.reduce((total, perfil) => total + perfil.descartadas.length, 0);
    console.log(`${modo}: ${lidos.length}/${roster.length} fichas · ${lidos.reduce((t, p) => t + p.linhas.length, 0)} pares · ${descartadas} linhas descartadas · maior desvio de média: ${pior ? `${pior.nome} ${pior.amplitude.toFixed(2)}` : "—"}`);
  }

  if (dryRun) { console.log("--dry-run: nada foi escrito."); return; }
  await writeFile(OUTPUT_PATH, serialize(porModo), "utf8");
  console.log(`Escrito ${OUTPUT_PATH}`);
}

if (process.argv[1] && process.argv[1].endsWith("import-brawlscope-matchups.mjs")) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
