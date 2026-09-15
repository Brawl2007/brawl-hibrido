import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");
const rosterFiles = [
  resolve(projectRoot, "client/src/data/rankedData.ts"),
  resolve(projectRoot, "client/src/data/additionalRankedData.ts"),
];
const generatedDataPath = resolve(projectRoot, "shared/prodigyCounterData.ts");
const reportPath = resolve(projectRoot, "reports/prodigy-counter-import.json");
const baseUrl = "https://powerleagueprodigy.com";

const slugOverrides = {
  "8-Bit": "8-bit",
  "El Primo": "el-primo",
  "Mr. P": "mr-p",
  "R-T": "r-t",
  "Jae-Yong": "jae-yong",
};

const normalize = (value) => value.trim().toLowerCase().replace(/[\s_.-]+/g, "");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeTemplate = (value) => value.replace(/`/g, "\\`").replace(/\\/g, "\\\\");

function toSlug(name) {
  return slugOverrides[name] ?? name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function htmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function listBrawlersInSection(section, roster) {
  const orderedNames = [...roster].sort((left, right) => right.length - left.length);
  const seen = new Set();
  const matches = [];
  for (const name of orderedNames) {
    const matcher = new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}(?=$|[^a-z0-9])`, "gi");
    if (matcher.test(section) && !seen.has(normalize(name))) {
      seen.add(normalize(name));
      matches.push(name);
    }
  }
  return matches;
}

function sliceSection(text, startPattern, endPatterns) {
  const start = text.search(startPattern);
  if (start === -1) return null;
  const afterStart = text.slice(start).replace(startPattern, "");
  let end = afterStart.length;
  for (const pattern of endPatterns) {
    const candidate = afterStart.search(pattern);
    if (candidate !== -1 && candidate < end) end = candidate;
  }
  return afterStart.slice(0, end).trim();
}

function parseGuide(html, brawler, roster) {
  const text = htmlToText(html);
  const escapedName = escapeRegExp(brawler);
  const targetsSection = sliceSection(
    text,
    new RegExp(`${escapedName}\\s+Counters\\s+These\\s+Brawlers`, "i"),
    [/Watch Out/i, new RegExp(`Brawlers\\s+That\\s+Counter\\s+${escapedName}`, "i"), /A legacy guide/i, /Privacy Policy/i],
  );
  const counteredBySection = sliceSection(
    text,
    new RegExp(`Brawlers\\s+That\\s+Counter\\s+${escapedName}`, "i"),
    [/A legacy guide/i, /Privacy Policy/i, /Support with Code/i],
  );

  if (targetsSection === null || counteredBySection === null) return null;
  return {
    targets: listBrawlersInSection(targetsSection, roster).filter((name) => normalize(name) !== normalize(brawler)),
    counteredBy: listBrawlersInSection(counteredBySection, roster).filter((name) => normalize(name) !== normalize(brawler)),
  };
}

async function rosterFromProject() {
  const source = await Promise.all(rosterFiles.map((path) => readFile(path, "utf8")));
  const names = new Set();
  for (const text of source) {
    for (const match of text.matchAll(/"brawler"\s*:\s*"([^"]+)"/g)) names.add(match[1]);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

async function fetchGuide(brawler) {
  const slug = toSlug(brawler);
  const sourceUrl = `${baseUrl}/${slug}`;
  const response = await fetch(sourceUrl, {
    headers: { "User-Agent": "BrawlHibrido/1.0 (guide-audit; contact: owner via site)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return { sourceUrl, status: "missing-guide", html: null };
  const html = await response.text();
  // As páginas reais usam títulos diferentes consoante a versão do guia.
  // A presença dos dois títulos de matchup é a única validação necessária
  // antes de permitir a extração literal abaixo.
  if (!/Counters\s+These\s+Brawlers/i.test(html) || !/Brawlers\s+That\s+Counter/i.test(html)) {
    return { sourceUrl, status: "missing-guide", html: null };
  }
  return { sourceUrl, status: "fetched", html };
}

async function runPool(values, limit, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

function createGeneratedModule(entries) {
  const body = Object.entries(entries)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `  ${JSON.stringify(key)}: { targets: ${JSON.stringify(entry.targets)}, counteredBy: ${JSON.stringify(entry.counteredBy)}, sourceUrl: ${JSON.stringify(entry.sourceUrl)} },`)
    .join("\n");
  return `/**\n * AUTO-GENERATED by server/scripts/import-prodigy-counters.mjs.\n * This file contains only literals parsed from public Power League Prodigy guide pages.\n * Do not edit manually; rerun the importer to refresh it.\n */\nexport const prodigyCounterData = {\n${body}\n} as const;\n\nexport type ProdigyCounterEntry = (typeof prodigyCounterData)[keyof typeof prodigyCounterData];\n`;
}

const roster = await rosterFromProject();
if (roster.length !== 105) {
  throw new Error(`Roster inválido: esperados 105 brawlers, encontrados ${roster.length}.`);
}

console.log(`[Prodigy importer] A extrair ${roster.length} guias com 4 pedidos paralelos...`);
const scanned = await runPool(roster, 4, async (brawler) => {
  try {
    const fetched = await fetchGuide(brawler);
    if (!fetched.html) return { brawler, sourceUrl: fetched.sourceUrl, status: fetched.status, targets: [], counteredBy: [] };
    const parsed = parseGuide(fetched.html, brawler, roster);
    if (!parsed) return { brawler, sourceUrl: fetched.sourceUrl, status: "unrecognised-sections", targets: [], counteredBy: [] };
    return { brawler, sourceUrl: fetched.sourceUrl, status: "imported", ...parsed };
  } catch (error) {
    return { brawler, sourceUrl: `${baseUrl}/${toSlug(brawler)}`, status: "request-error", targets: [], counteredBy: [], error: error instanceof Error ? error.message : String(error) };
  }
});

const imported = Object.fromEntries(scanned
  .filter((entry) => entry.status === "imported")
  .map((entry) => [normalize(entry.brawler), { targets: entry.targets, counteredBy: entry.counteredBy, sourceUrl: entry.sourceUrl }]));

const report = {
  generatedAt: new Date().toISOString(),
  source: baseUrl,
  rosterCount: roster.length,
  importedCount: Object.keys(imported).length,
  notImportedCount: roster.length - Object.keys(imported).length,
  entries: scanned,
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(generatedDataPath, createGeneratedModule(imported), "utf8");
console.log(JSON.stringify({ rosterCount: report.rosterCount, importedCount: report.importedCount, notImportedCount: report.notImportedCount, reportPath, generatedDataPath }, null, 2));
