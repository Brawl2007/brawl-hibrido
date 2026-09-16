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
 * Verifica também que o ficheiro de destino SOBREVIVE ao `.vercelignore`.
 *
 * Esse é o segundo caso, e custou um deploy: o `shared/plProdigyCounterData.ts`
 * importa `../reports/prodigy-counter-import.json`, e o `.vercelignore` excluía
 * a pasta `/reports/` inteira. O ficheiro existe no repositório, portanto a
 * verificação de cima passava e o build local passava — mas na Vercel a pasta
 * nem sequer é enviada, e o `vite build` morria com "Could not resolve".
 *
 * Um import só é seguro se o ficheiro existir E for publicado. São as duas
 * perguntas, e só ambas juntas é que garantem que o site compila lá.
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

/** O ficheiro que o import resolve, ou null. Devolve o caminho, não só um sim. */
function resolves(target) {
  for (const extension of EXTENSIONS) {
    const candidate = `${target}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  for (const index of ["index.ts", "index.tsx", "index.js"]) {
    const candidate = path.join(target, index);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * As regras do `.vercelignore` que sabemos ler, e o que cada forma significa.
 *
 * Deliberadamente conservador: uma regra com forma que não reconheçamos é
 * ignorada, e não inventada. Um falso alarme aqui trava um deploy bom, que é
 * pior do que deixar passar uma regra exótica que ninguém escreveu ainda.
 */
function lerRegrasIgnoradas() {
  let conteudo;
  try {
    conteudo = fs.readFileSync(path.join(ROOT, ".vercelignore"), "utf-8");
  } catch {
    return []; // sem ficheiro não há nada excluído
  }
  return conteudo
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha && !linha.startsWith("#") && !linha.startsWith("!"));
}

/** Um glob simples (`*` e `?`) aplicado a um único segmento do caminho. */
function globCasa(padrao, texto) {
  const expressao = padrao
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${expressao}$`).test(texto);
}

/** O caminho (relativo à raiz, com `/`) seria removido do envio para a Vercel? */
function ehIgnorado(relativo, regras) {
  const base = path.posix.basename(relativo);
  return regras.some((regra) => {
    if (regra.startsWith("**/")) return globCasa(regra.slice(3), base);
    if (regra.startsWith("/") && regra.endsWith("/")) return relativo.startsWith(regra.slice(1));
    if (regra.includes("*") || regra.includes("?")) return globCasa(regra, base);
    const limpa = regra.replace(/^\/+|\/+$/g, "");
    return relativo === limpa || relativo.startsWith(`${limpa}/`);
  });
}

const REGRAS_IGNORADAS = lerRegrasIgnoradas();

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
      const destino = resolves(target);
      if (!destino) {
        problemas.push({ file: path.relative(ROOT, file), specifier, razao: "não existe" });
        continue;
      }
      const relativo = path.relative(ROOT, destino).split(path.sep).join("/");
      if (ehIgnorado(relativo, REGRAS_IGNORADAS)) {
        problemas.push({ file: path.relative(ROOT, file), specifier, razao: `existe, mas o .vercelignore não o publica (${relativo})` });
      }
    }
  }
}

if (problemas.length) {
  console.error(`\n${problemas.length} import(s) não vão resolver no build publicado:\n`);
  for (const problema of problemas) console.error(`  ${problema.file}\n    → ${problema.specifier}  [${problema.razao}]`);
  console.error("\nO `vite build` vai falhar com estes. Corrigir antes de publicar.\n");
  process.exit(1);
}

console.log(`[imports] ${verificados} imports internos verificados, todos resolvem.`);
