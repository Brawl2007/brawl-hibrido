/**
 * Importa o Top 10 literal de sinergia ("Pair with") das páginas públicas do
 * BrawlScope e escreve `shared/brawlScopeSynergyData.ts`.
 *
 * Regras herdadas do importador de counters:
 * - nada é inferido: um perfil sem lista legível fica fora do ficheiro;
 * - a ordem publicada é preservada e a lista é cortada no décimo aliado;
 * - a URL individual de cada perfil é guardada para auditoria.
 *
 * Uso:
 *   node server/scripts/import-brawlscope-synergies.mjs
 *   node server/scripts/import-brawlscope-synergies.mjs --mode=knockout
 *   node server/scripts/import-brawlscope-synergies.mjs --rank=all
 *
 * Sem `--mode` lê a vista Overall; sem `--rank` lê Lendário+, que é o que a fonte
 * serve por omissão. Essa combinação é a leitura canónica do projeto.
 *   node server/scripts/import-brawlscope-synergies.mjs --dry-run
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const BASE_URL = "https://brawlscope.com";
// Legendary+ é o valor por omissão da fonte: NÃO leva parâmetro `rank`.
// `rank=all` significa "todas as patentes", que é uma leitura diferente.
const RANK_PARAMS = { legendary: "", all: "all", diamond: "diamond", mythic: "mythic", masters: "masters" };
const OUTPUT_PATH = path.resolve("shared/brawlScopeSynergyData.ts");
const MAX_CONCURRENCY = 6;
const TIMEOUT_MS = 20_000;
const SYNERGY_LIMIT = 10;

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const modeId = args.get("mode");
const rankId = args.get("rank") ?? "legendary";
const rankParam = RANK_PARAMS[rankId] ?? "";
const query = (extra) => {
  const params = new URLSearchParams(extra);
  if (rankParam) params.set("rank", rankParam);
  const value = params.toString();
  return value ? `?${value}` : "";
};
const dryRun = args.get("dry-run") === "true";

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function textContent(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "BrawlHibrido/1.0 (public synergy relation importer)" },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { ok: true, value: await worker(items[index]) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

/** Mesma leitura usada por `server/counterSync.ts`: o bloco que segue o rótulo. */
function sectionAfterLabel(pageHtml, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marker = new RegExp(`<p[^>]*>\\s*${escaped}\\s*<\\/p>`, "i").exec(pageHtml);
  if (!marker || marker.index === undefined) return "";
  const after = pageHtml.slice(marker.index + marker[0].length);
  const end = after.search(/<\/ul>/i);
  return end >= 0 ? after.slice(0, end) : after;
}

/** Percentagem publicada no cartão; exige sinal explícito para não confundir "8-Bit" com um valor. */
function publishedPercent(value) {
  const match = value.match(/([+\u2212-])\s*(\d+(?:[.,]\d+)?)\s*%?/);
  if (!match) return undefined;
  const amount = Number(match[2].replace(",", "."));
  if (!Number.isFinite(amount)) return undefined;
  return match[1] === "+" ? amount : -amount;
}

function stripPublishedPercent(value) {
  return value.replace(/\s*[+\u2212-]\s*\d+(?:[.,]\d+)?\s*%?\s*$/, "").trim();
}

function listFromSection(section) {
  return Array.from(section.matchAll(/<a[^>]*href=["']\/counters\/([^"'?]+)(?:\?[^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi))
    .map((match) => {
      const inner = match[2];
      const text = textContent(inner);
      const named = textContent(/<span[^>]*>([\s\S]*?)<\/span>/i.exec(inner)?.[1] ?? "");
      const brawler = stripPublishedPercent(named || text) || decodeURIComponent(match[1]).replace(/-/g, " ");
      return { brawler, delta: publishedPercent(text) };
    })
    .filter((entry) => Boolean(entry.brawler));
}

function profileName(pageHtml) {
  const match = pageHtml.match(/<h1[^>]*>\s*([^<]+?)\s+counters\s*<\/h1>/i);
  return match ? textContent(match[1]) : undefined;
}

function normalizeList(teammates, owner) {
  const ownerKey = owner.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const seen = new Set();
  const result = [];
  for (const teammate of teammates) {
    const name = teammate.brawler.trim();
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key || key === ownerKey || seen.has(key)) continue;
    seen.add(key);
    result.push(typeof teammate.delta === "number" ? { brawler: name, delta: teammate.delta } : { brawler: name });
    if (result.length === SYNERGY_LIMIT) break;
  }
  return result;
}

function findSlugs(indexHtml) {
  const matches = Array.from(indexHtml.matchAll(/href=["']\/counters\/([^"'?]+)(?:\?[^"']*)?["']/gi));
  return Array.from(new Set(matches.map((match) => decodeURIComponent(match[1]).trim()).filter(Boolean)));
}

function serialize(entries) {
  const body = entries
    .map(
      (entry) =>
        `  ${JSON.stringify(entry.key)}: {\n` +
        `    brawler: ${JSON.stringify(entry.brawler)},\n` +
        `    teammates: [${entry.teammates.map((teammate) => JSON.stringify(teammate)).join(",")}],\n` +
        `    sourceUrl: ${JSON.stringify(entry.sourceUrl)},\n` +
        `  },`,
    )
    .join("\n");

  return `/*
 * AUTO-GERADO a partir das páginas públicas de counters do BrawlScope.
 * Secção lida: "Pair with" (melhores aliados), na ordem publicada, até 10 nomes.
 * Gerado em: ${new Date().toISOString()}
 * Não editar à mão; reexecutar server/scripts/import-brawlscope-synergies.mjs.
 *
 * Um perfil sem lista legível não aparece aqui. Nenhuma entrada é criada por
 * inferência, reciprocidade ou outra fonte.
 */
export type BrawlScopeSynergyTeammate = {
  brawler: string;
  /** Percentagem publicada no cartão do aliado, tal como aparece na fonte. */
  delta?: number;
};

export interface BrawlScopeSynergyEntry {
  /** Nome editorial do brawler dono da página. */
  brawler: string;
  /** Até dez aliados na ordem publicada em \`Pair with\`. */
  teammates: BrawlScopeSynergyTeammate[];
  sourceUrl: string;
}

/** Limite publicado pela fonte; nenhuma lista canónica excede este valor. */
export const BRAWLSCOPE_SYNERGY_LIMIT = ${SYNERGY_LIMIT};

export const brawlScopeSynergyData: Record<string, BrawlScopeSynergyEntry> = {
${body}
};

/** Normaliza a lista lida numa página, sem completar posições ausentes. */
export function normalizeBrawlScopeSynergyList(
  teammates: readonly (string | BrawlScopeSynergyTeammate)[],
  owner: string,
): BrawlScopeSynergyTeammate[] {
  const ownerKey = owner.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
  const seen = new Set<string>();
  const result: BrawlScopeSynergyTeammate[] = [];
  for (const teammate of teammates) {
    const entry = typeof teammate === "string" ? { brawler: teammate } : teammate;
    const name = entry.brawler?.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key || key === ownerKey || seen.has(key)) continue;
    seen.add(key);
    result.push(typeof entry.delta === "number" && Number.isFinite(entry.delta) ? { brawler: name, delta: entry.delta } : { brawler: name });
    if (result.length === BRAWLSCOPE_SYNERGY_LIMIT) break;
  }
  return result;
}
`;
}

async function main() {
  const indexUrl = `${BASE_URL}/counters${query(modeId ? { mode: modeId } : {})}`;
  const indexHtml = await fetchText(indexUrl);
  const slugs = findSlugs(indexHtml);
  if (slugs.length < 80) {
    throw new Error(`Índice incompleto: apenas ${slugs.length} perfis encontrados em ${indexUrl}.`);
  }

  const results = await mapWithConcurrency(slugs, MAX_CONCURRENCY, async (slug) => {
    const sourceUrl = `${BASE_URL}/counters/${encodeURIComponent(slug)}${query(modeId ? { mode: modeId } : {})}`;
    const html = await fetchText(sourceUrl);
    const brawler = profileName(html) ?? slug.replace(/-/g, " ");
    const teammates = normalizeList(listFromSection(sectionAfterLabel(html, "Pair with")), brawler);
    return { key: slug, brawler, teammates, sourceUrl };
  });

  const ok = results.filter((result) => result.ok).map((result) => result.value);
  const withList = ok.filter((entry) => entry.teammates.length > 0).sort((left, right) => left.key.localeCompare(right.key));
  const empty = ok.filter((entry) => entry.teammates.length === 0).map((entry) => entry.brawler);
  const failed = results.filter((result) => !result.ok).length;

  console.log(`Vista: ${modeId ?? "Overall"} · ${rankId === "legendary" ? "Lendário+" : rankId}`);
  console.log(`Perfis lidos: ${ok.length}/${slugs.length} (${failed} falhas de rede/parse)`);
  console.log(`Perfis com lista "Pair with": ${withList.length}`);
  if (empty.length) console.log(`Sem lista legível (ficam fora do ficheiro): ${empty.join(", ")}`);
  const partial = withList.filter((entry) => entry.teammates.length < SYNERGY_LIMIT);
  if (partial.length) {
    console.log(`Listas parciais preservadas como publicadas: ${partial.map((entry) => `${entry.brawler} (${entry.teammates.length})`).join(", ")}`);
  }

  if (!withList.length) throw new Error("Nenhuma lista legível: o ficheiro não é reescrito.");
  if (dryRun) {
    console.log("--dry-run: nada foi escrito.");
    return;
  }

  await writeFile(OUTPUT_PATH, serialize(withList), "utf8");
  console.log(`Escrito ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
