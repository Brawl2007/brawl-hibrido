import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const BASE_URL = "https://www.brawlplanet.com";
const INDEX_URL = `${BASE_URL}/brawlers`;
const OUTPUT_PATH = path.resolve("shared/brawlPlanetRelationData.ts");
const MAX_CONCURRENCY = 5;
const timeoutMs = 20_000;

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;|&#x2212;|&minus;/g, "−")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function textContent(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "BrawlHibrido/1.0 (public statistical relation importer)" },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function findBrawlerSlugs(indexHtml) {
  const matches = [...indexHtml.matchAll(/href=["']\/brawlers\/([^"'/?#]+)["']/gi)];
  return [...new Set(matches.map((match) => decodeURIComponent(match[1]).trim()).filter(Boolean))];
}

function sectionHtml(pageHtml, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`<h3[^>]*>\\s*${escapedHeading}\\s*<\\/h3>`, "i");
  const match = headingPattern.exec(pageHtml);
  if (!match || match.index === undefined) return "";
  const afterHeading = pageHtml.slice(match.index + match[0].length);
  const nextHeading = afterHeading.search(/<h3[^>]*>/i);
  const nextSection = afterHeading.search(/<\/section>/i);
  const end = [nextHeading, nextSection]
    .filter((position) => position >= 0)
    .sort((a, b) => a - b)[0] ?? afterHeading.length;
  return afterHeading.slice(0, end);
}

function signedDelta(value) {
  const delta = value.match(/([+−-])\s*(\d+(?:\.\d+)?)/);
  if (!delta) return null;
  const number = Number(delta[2]);
  return delta[1] === "-" || delta[1] === "−" ? -number : number;
}

function relationEntries(section, knownNames) {
  const rows = [];
  const seen = new Set();
  const links = section.matchAll(
    /<a[^>]*href=["']\/brawlers\/([^"'/?#]+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  );
  for (const link of links) {
    const slug = decodeURIComponent(link[1]).trim();
    const brawler = knownNames.get(slug);
    if (!brawler || seen.has(slug)) continue;
    const delta = signedDelta(textContent(link[2]));
    if (delta === null) continue;
    seen.add(slug);
    rows.push({ brawler, delta });
  }
  return rows;
}

function profileName(pageHtml) {
  const match = pageHtml.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i);
  return match ? textContent(match[1]) : null;
}

async function mapWithConcurrency(items, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, items.length) }, run));
  return results;
}

const indexHtml = await fetchText(INDEX_URL);
const slugs = findBrawlerSlugs(indexHtml);
if (slugs.length < 100) {
  throw new Error(`A lista pública devolveu apenas ${slugs.length} fichas; importação cancelada.`);
}

console.log(`A extrair ${slugs.length} fichas públicas do Brawl Planet…`);
const fetched = await mapWithConcurrency(slugs, async (slug) => {
  const sourceUrl = `${BASE_URL}/brawlers/${encodeURIComponent(slug)}`;
  const html = await fetchText(sourceUrl);
  const brawler = profileName(html);
  if (!brawler) throw new Error(`Não foi possível identificar o nome do brawler em ${sourceUrl}.`);
  return { slug, sourceUrl, brawler, html };
});

const knownNames = new Map(fetched.map(({ slug, brawler }) => [slug, brawler]));
const relationData = Object.fromEntries(
  fetched
    .map(({ slug, sourceUrl, brawler, html }) => [
      slug,
      {
        brawler,
        sourceUrl,
        bestTeammates: relationEntries(sectionHtml(html, "Best Teammates"), knownNames),
        worstTeammates: relationEntries(sectionHtml(html, "Worst Teammates"), knownNames),
        strongAgainst: relationEntries(sectionHtml(html, "Strong Against"), knownNames),
        strugglesAgainst: relationEntries(sectionHtml(html, "Struggles Against"), knownNames),
      },
    ])
    .sort(([left], [right]) => left.localeCompare(right)),
);

const generatedAt = new Date().toISOString();
const output = `/**
 * AUTO-GENERATED from public Brawl Planet brawler pages.
 * Source index: ${INDEX_URL}
 * Generated at: ${generatedAt}
 * Do not edit manually; rerun server/scripts/extract-brawlplanet-relations.mjs.
 */

export type BrawlPlanetRelation = { brawler: string; delta: number };

export type BrawlPlanetBrawlerRelations = {
  brawler: string;
  sourceUrl: string;
  bestTeammates: BrawlPlanetRelation[];
  worstTeammates: BrawlPlanetRelation[];
  strongAgainst: BrawlPlanetRelation[];
  strugglesAgainst: BrawlPlanetRelation[];
};

export const brawlPlanetRelationData: Record<string, BrawlPlanetBrawlerRelations> = ${JSON.stringify(relationData, null, 2)};
`;

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, output, "utf8");

const coverage = Object.values(relationData).filter(
  (entry) =>
    entry.bestTeammates.length > 0 &&
    entry.worstTeammates.length > 0 &&
    entry.strongAgainst.length > 0 &&
    entry.strugglesAgainst.length > 0,
).length;
console.log(
  `Concluído: ${Object.keys(relationData).length} fichas; ${coverage} com dados nos quatro blocos literais.`,
);
