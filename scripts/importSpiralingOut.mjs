import { writeFile } from "node:fs/promises";

const URL = "https://www.brawlplanet.com/maps/spiralingout_brawlball";
const html = await (await fetch(URL, { headers: { "user-agent": "Brawl-Hibrido/1.0" } })).text();

function decode(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}

const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((match) => match[0]);
const rankedTable = tables.find((table) => /Brawler/i.test(table) && /Star/i.test(table) && /Win/i.test(table));
if (!rankedTable) throw new Error("Brawl Planet table not found");
const rows = [...rankedTable.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
  .map((match) => [...match[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => decode(cell[1])))
  .filter((cells) => cells.length >= 5 && /^\d+$/.test(cells[0]));

const canonicalNames = new Map([
  ["8-Bit", "8-bit"],
  ["Jae-Yong", "Jae-yong"],
  ["R-T", "R-t"],
]);

const parsed = rows.map(([, rawBrawler, winRate, pickRate, starPlayer]) => ({
  map: "Spiraling Out",
  mode: "Fute-Brawl",
  modeId: "brawl-ball",
  brawler: canonicalNames.get(rawBrawler) ?? rawBrawler,
  score: null,
  tier: null,
  brawlPlanetWinRate: Number(winRate.replace(",", ".")),
  brawlPlanetPickRate: Number(pickRate.replace(",", ".")),
  brawlPlanetStarPlayer: Number(starPlayer.replace(",", ".")),
  dataStatus: "complete",
}));

if (parsed.length !== 106) throw new Error(`Expected 106 brawlers, received ${parsed.length}`);
const output = `// Imported from Brawl Planet: ${URL}\n// 106 brawlers, Brawl Ball / Spiraling Out. Raw metrics are preserved; hybrid scores are normalized at runtime.\nexport const spiralingOutRankedRows = ${JSON.stringify(parsed, null, 2)} as const;\nexport const spiralingOutMapSummary = { name: "Spiraling Out", mode: "Fute-Brawl", modeId: "brawl-ball", brawlerCount: 106, topScore: 0, tiers: { S: 0, A: 0, B: 106 } } as const;\nexport const spiralingOutRankedMap = { name: "Spiraling Out", mode: "Fute-Brawl", modeId: "brawl-ball", mapId: "15001021" } as const;\n`;
await writeFile("client/src/data/spiralingOutRankedData.ts", output);
console.log(`Imported ${parsed.length} brawlers for Spiraling Out`);
console.log(parsed.slice(0, 5));
