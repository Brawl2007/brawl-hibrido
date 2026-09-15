#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const publicDir = path.join(root, "public");
const index = path.join(publicDir, "index.html");
if (!fs.existsSync(index)) {
  throw new Error("O build da Vercel não gerou public/index.html.");
}
const html = fs.readFileSync(index, "utf8");
const assets = [...html.matchAll(/(?:src|href)=\"(\/assets\/[^\"]+)\"/g)].map((match) => match[1]);
const missing = assets.filter((asset) => !fs.existsSync(path.join(root, "public", asset)));
if (missing.length) {
  throw new Error(`Assets ausentes no build da Vercel: ${missing.slice(0, 3).join(", ")}`);
}
console.log(`[vercel] public/ validado: ${assets.length} assets encontrados.`);
