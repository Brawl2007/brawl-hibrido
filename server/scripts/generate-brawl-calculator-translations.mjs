import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const sourcePath = path.join(projectRoot, "shared/brawlCalculatorCounterData.ts");
const outputPath = path.join(projectRoot, "shared/brawlCalculatorTipTranslations.ts");
const maxBatchCharacters = 4200;

function extractReasons(source) {
  const matches = [...source.matchAll(/"reason":\s*"((?:\\.|[^"\\])*)"/g)];
  return [...new Set(matches.map((match) => JSON.parse(`"${match[1]}"`)))].sort((left, right) => left.localeCompare(right));
}

function extractBrawlerNames(source) {
  const matches = [...source.matchAll(/"brawler":\s*"((?:\\.|[^"\\])*)"/g)];
  return [...new Set(matches.map((match) => JSON.parse(`"${match[1]}"`)))].sort((left, right) => right.length - left.length);
}

function protectBrawlerNames(reason, brawlerNames) {
  const protectedNames = [];
  let protectedReason = reason;
  for (const brawler of brawlerNames) {
    const expression = new RegExp(`\\b${brawler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    protectedReason = protectedReason.replace(expression, () => {
      const token = `qzxbrawler${protectedNames.length.toString().padStart(3, "0")}qzx`;
      protectedNames.push({ token, brawler });
      return token;
    });
  }
  return { protectedReason, protectedNames };
}

function restoreBrawlerNames(reason, protectedNames) {
  return protectedNames.reduce((restored, { token, brawler }) => restored.replaceAll(token, brawler), reason);
}

async function translateBatch(batch, brawlerNames) {
  const prepared = batch.map((sourceReason, index) => ({ sourceReason, ...protectBrawlerNames(sourceReason, brawlerNames), separator: `qzxtip${index.toString().padStart(3, "0")}qzx` }));
  const input = prepared.flatMap(({ protectedReason, separator }) => [protectedReason, separator]).join("\n");
  const endpoint = new URL("https://translate.googleapis.com/translate_a/single");
  endpoint.searchParams.set("client", "gtx");
  endpoint.searchParams.set("sl", "en");
  endpoint.searchParams.set("tl", "pt");
  endpoint.searchParams.set("dt", "t");
  endpoint.searchParams.set("q", input);
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`Public translation request failed with HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const translatedText = payload?.[0]?.map((segment) => segment?.[0] ?? "").join("");
  if (typeof translatedText !== "string") throw new Error("Public translation response did not include translated text.");
  const sections = translatedText.split(/qzxtip\d{3}qzx\s*/i).map((section) => section.trim()).filter(Boolean);
  if (sections.length !== batch.length) throw new Error(`Expected ${batch.length} translated tips but received ${sections.length}.`);
  return new Map(prepared.map((item, index) => [item.sourceReason, restoreBrawlerNames(sections[index], item.protectedNames)]));
}

function splitIntoBatches(reasons) {
  const batches = [];
  let current = [];
  let length = 0;
  for (const reason of reasons) {
    const extraLength = reason.length + 20;
    if (current.length && length + extraLength > maxBatchCharacters) {
      batches.push(current);
      current = [];
      length = 0;
    }
    current.push(reason);
    length += extraLength;
  }
  if (current.length) batches.push(current);
  return batches;
}

const source = await readFile(sourcePath, "utf8");
const reasons = extractReasons(source);
const brawlerNames = extractBrawlerNames(source);
const translations = new Map();

const batches = splitIntoBatches(reasons);
for (let index = 0; index < batches.length; index += 1) {
  const batch = batches[index];
  console.log(`Translating batch ${index + 1}/${batches.length} (${batch.length} tips)`);
  for (const [sourceReason, translatedReason] of await translateBatch(batch, brawlerNames)) translations.set(sourceReason, translatedReason);
}

const translationRecord = Object.fromEntries([...translations.entries()].sort(([left], [right]) => left.localeCompare(right)));
const output = `/**\n * Traduções estáticas em português das dicas literais do Brawl Calculator.\n * Cada chave corresponde exatamente ao texto original guardado em brawlCalculatorCounterData.ts.\n * As relações, brawlers e URLs continuam a vir da fonte literal original.\n * Gerado por server/scripts/generate-brawl-calculator-translations.mjs.\n */\nexport const brawlCalculatorTipTranslations: Record<string, string> = ${JSON.stringify(translationRecord, null, 2)};\n\nexport function getBrawlCalculatorTipTranslation(reason: string) {\n  return brawlCalculatorTipTranslations[reason] ?? reason;\n}\n`;
await writeFile(outputPath, output, "utf8");
console.log(`Wrote ${translations.size} translations to ${outputPath}`);
