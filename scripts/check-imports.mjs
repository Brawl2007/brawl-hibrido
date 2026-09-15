#!/usr/bin/env node
/**
 * Verifica que todos os imports internos apontam para ficheiros que existem.
 *
 * Existe por causa de um caso concreto: o `Draft.tsx` importava
 * `@shared/brawlScopeMatchupsByMode` quando o ficheiro se chama
 * `brawlScopeMatchupsByMode.generated.ts`. O `tsc --noEmit` não o apanhou na
 * configuração do projeto, mas o `vite build` **falha** — ou seja, o site não
 * compilava de todo, e isso só se descobria no momento da publicação.
 *
 * É uma verificação de segundos que evita um deploy falhado. Corre com:
 *   pnpm check:imports
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN = ["client/src", "server", "shared"];
const ALIASES = {
  "@shared/": path.join(ROOT, "shared"),
  "@/": path.join(ROOT, "client", "src"),
  "@assets/": path.join(ROOT, "attached_assets"),
};
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".css"];

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

function resolves(target) {
  for (const extension of EXTENSIONS) {
    const candidate = `${target}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return true;
  }
  for (const index of ["index.ts", "index.tsx", "index.js"]) {
    if (fs.existsSync(path.join(target, index))) return true;
  }
  return false;
}

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

/**
 * Exemplos de import dentro de comentários são documentação, não código. Sem
 * isto, um bloco `/** import { x } from "./y" *\/` era reportado como erro.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const problemas = [];
let verificados = 0;

for (const base of SCAN) {
  for (const file of walk(path.join(ROOT, base))) {
    const source = stripComments(fs.readFileSync(file, "utf-8"));
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      let target = null;

      if (specifier.startsWith(".")) {
        target = path.resolve(path.dirname(file), specifier);
      } else {
        const alias = Object.keys(ALIASES).find((prefix) => specifier.startsWith(prefix));
        if (alias) target = path.join(ALIASES[alias], specifier.slice(alias.length));
      }
      if (!target) continue; // pacote externo — resolvido pelo gestor de pacotes

      verificados += 1;
      if (!resolves(target)) {
        problemas.push({ file: path.relative(ROOT, file), specifier });
      }
    }
  }
}

if (problemas.length) {
  console.error(`\n${problemas.length} import(s) apontam para ficheiros que não existem:\n`);
  for (const problema of problemas) console.error(`  ${problema.file}\n    → ${problema.specifier}`);
  console.error("\nO `vite build` vai falhar com estes. Corrigir antes de publicar.\n");
  process.exit(1);
}

console.log(`[imports] ${verificados} imports internos verificados, todos resolvem.`);
