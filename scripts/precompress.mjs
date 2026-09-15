#!/usr/bin/env node
/**
 * Pré-compressão dos ficheiros estáticos.
 *
 * O site envia cerca de 1 MB de JavaScript só de catálogos de dados (rotação
 * ranked, deltas do BrawlScope, relações do Brawl Planet). São ficheiros muito
 * repetitivos, por isso comprimem extraordinariamente bem — na ordem dos 90%.
 * Sem compressão, um telemóvel em dados móveis descarrega o megabyte inteiro
 * antes de ver o primeiro pixel.
 *
 * Em vez de comprimir a cada pedido (o que gasta CPU do servidor em todos os
 * acessos), comprime-se uma vez no build e guarda-se o resultado ao lado do
 * original. O servidor só tem de escolher o ficheiro certo — ver `serveStatic`
 * em `server/_core/vite.ts`.
 *
 * Corre no fim de `pnpm build`, encadeado com `&&` no próprio script — não como
 * `postbuild`, porque o pnpm ignora os scripts `post` por omissão desde a v7.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "dist", "public");

/** Só vale a pena comprimir formatos de texto. Imagens e fontes já vêm comprimidas. */
const COMPRESSIBLE = new Set([".js", ".mjs", ".css", ".html", ".json", ".svg", ".txt", ".map", ".webmanifest"]);

/** Abaixo disto o cabeçalho extra custa mais do que aquilo que se poupa. */
const MIN_BYTES = 1024;

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function main() {
  if (!fs.existsSync(TARGET)) {
    console.log("[precompress] `dist/public` não existe — nada a fazer.");
    return;
  }

  let ficheiros = 0;
  let antes = 0;
  let depois = 0;

  for (const file of walk(TARGET)) {
    if (file.endsWith(".gz") || file.endsWith(".br")) continue;
    if (!COMPRESSIBLE.has(path.extname(file))) continue;

    const raw = fs.readFileSync(file);
    if (raw.length < MIN_BYTES) continue;

    const gzip = zlib.gzipSync(raw, { level: zlib.constants.Z_BEST_COMPRESSION });
    const brotli = zlib.brotliCompressSync(raw, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
      },
    });

    // Guarda apenas se houver ganho real; caso contrário serve-se o original.
    if (gzip.length < raw.length) fs.writeFileSync(`${file}.gz`, gzip);
    if (brotli.length < raw.length) fs.writeFileSync(`${file}.br`, brotli);

    ficheiros += 1;
    antes += raw.length;
    depois += Math.min(raw.length, brotli.length, gzip.length);
  }

  if (!ficheiros) {
    console.log("[precompress] Nenhum ficheiro elegível.");
    return;
  }

  const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
  const poupanca = antes ? Math.round(((antes - depois) / antes) * 100) : 0;
  console.log(`[precompress] ${ficheiros} ficheiros: ${kb(antes)} → ${kb(depois)} (−${poupanca}%).`);
}

main();
