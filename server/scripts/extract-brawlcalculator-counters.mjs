import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://brawlcalculator.com";
const INDEX_URL = `${BASE_URL}/counters/`;
const OUTPUT_PATH = path.resolve("shared/brawlCalculatorCounterData.ts");
const MAX_CONCURRENCY = 4;
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
      headers: { "User-Agent": "BrawlHibrido/1.0 (public counter relation importer)" },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function findCounterSlugs(indexHtml) {
  const matches = [...indexHtml.matchAll(/href=["']\/counters\/([^"'/?#]+)\/["']/gi)];
  return [...new Set(matches.map((match) => decodeURIComponent(match[1]).trim()).filter(Boolean))];
}

function sectionAfter(pageHtml, headingPattern) {
  const heading = headingPattern.exec(pageHtml);
  if (!heading || heading.index === undefined) return "";
  const afterHeading = pageHtml.slice(heading.index + heading[0].length);
  const nextHeading = afterHeading.search(/<h2[^>]*>/i);
  const nextSection = afterHeading.search(/<\/section>/i);
  const end = [nextHeading, nextSection].filter((position) => position >= 0).sort((a, b) => a - b)[0] ?? afterHeading.length;
  return afterHeading.slice(0, end);
}

function relationEntries(sectionHtml) {
  const entries = [];
  const seen = new Set();
  for (const match of sectionHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const row = match[1];
    const link = /href=["']\/counters\/([^"'/?#]+)\/["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!link) continue;
    const slug = decodeURIComponent(link[1]).trim();
    if (seen.has(slug)) continue;
    const nameMatch = /<span[^>]*>([\s\S]*?)<\/span>/i.exec(link[2]);
    const brawler = textContent(nameMatch?.[1] ?? link[2]);
    if (!brawler) continue;
    const reasonMatch = /<p[^>]*class=["'][^"']*why[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(row);
    seen.add(slug);
    entries.push({ brawler, reason: textContent(reasonMatch?.[1] ?? "") });
  }
  return entries;
}

function profileName(pageHtml) {
  const heading = /<h1[^>]*>\s*([^<]+?)\s+Counters\s*<\/h1>/i.exec(pageHtml);
  return heading ? textContent(heading[1]) : null;
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
const slugs = findCounterSlugs(indexHtml);
if (slugs.length < 100) throw new Error(`A lista pública devolveu apenas ${slugs.length} fichas; importação cancelada.`);

console.log(`A extrair ${slugs.length} fichas públicas do Brawl Calculator…`);
const records = await mapWithConcurrency(slugs, async (slug) => {
  const sourceUrl = `${BASE_URL}/counters/${encodeURIComponent(slug)}/`;
  const html = await fetchText(sourceUrl);
  const brawler = profileName(html);
  if (!brawler) throw new Error(`Não foi possível identificar o brawler em ${sourceUrl}.`);
  return {
    slug,
    brawler,
    sourceUrl,
    counteredBy: relationEntries(sectionAfter(html, /<h2[^>]*>\s*Best counters to\s+[^<]+<\/h2>/i)),
    targets: relationEntries(sectionAfter(html, /<h2[^>]*>\s*[^<]+\s+is a strong pick against\s*<\/h2>/i)),
  };
});

const data = Object.fromEntries(records.sort((left, right) => left.slug.localeCompare(right.slug)).map((record) => [record.slug, record]));
const output = `/**\n * AUTO-GENERATED from public Brawl Calculator counter pages.\n * Source index: ${INDEX_URL}\n * Generated at: ${new Date().toISOString()}\n * Contains only literal public lists; rerun server/scripts/extract-brawlcalculator-counters.mjs to refresh.\n */\n\nexport type BrawlCalculatorCounterRelation = { brawler: string; reason: string };\n\nexport type BrawlCalculatorCounterProfile = {\n  slug: string;\n  brawler: string;\n  sourceUrl: string;\n  counteredBy: BrawlCalculatorCounterRelation[];\n  targets: BrawlCalculatorCounterRelation[];\n};\n\nexport const brawlCalculatorCounterData: Record<string, BrawlCalculatorCounterProfile> = ${JSON.stringify(data, null, 2)};\n`;

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, output, "utf8");

const profilesWithBothDirections = records.filter((record) => record.counteredBy.length > 0 && record.targets.length > 0).length;
console.log(`Concluído: ${records.length} fichas; ${profilesWithBothDirections} com counters e alvos públicos.`);
