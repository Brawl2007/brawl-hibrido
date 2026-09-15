#!/usr/bin/env node
/**
 * Guarda do sistema de cor.
 *
 * A folha de estilos passou a usar tokens (`var(--bh-gold)`) em vez de cores
 * escritas à mão. Isso resolve a desarrumação, mas cria um risco novo: um token
 * mal escrito não dá erro nenhum. O CSS ignora a declaração em silêncio e o
 * elemento fica com a cor herdada — texto invisível, borda que desaparece,
 * fundo preto onde devia estar um cartão. Nada na consola, nada nos testes.
 *
 * Este verificador fecha essa porta. Corre com:
 *   pnpm check:css
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS_DIR = path.join(ROOT, "client", "src");

function* stylesheets(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* stylesheets(full);
    else if (entry.name.endsWith(".css")) yield full;
  }
}

const files = [...stylesheets(CSS_DIR)];
const source = files.map((file) => fs.readFileSync(file, "utf-8")).join("\n");

/** Tokens declarados em qualquer bloco (`--x: valor`). */
const declared = new Set([...source.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((match) => match[1]));
/** Tokens consumidos (`var(--x)`), ignorando o valor de reserva. */
const used = new Map();
for (const file of files) {
  const css = fs.readFileSync(file, "utf-8");
  for (const match of css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
    if (!used.has(match[1])) used.set(match[1], path.relative(ROOT, file));
  }
}

const missing = [...used.entries()].filter(([token]) => !declared.has(token));
const unused = [...declared].filter((token) => token.startsWith("--bh-") && !used.has(token));

/**
 * Uma cor escrita à mão fora do bloco de tokens é uma decisão avulsa a mais.
 * Não é um erro — é dívida, e por isso apenas se conta.
 */
const literals = new Set();
for (const file of files) {
  const css = fs.readFileSync(file, "utf-8");
  const body = css.includes(":root {") ? css.slice(css.lastIndexOf("}", css.indexOf("* { box-sizing")) + 1) : css;
  for (const match of body.matchAll(/#[0-9a-fA-F]{6}\b/g)) literals.add(match[0].toLowerCase());
}

/*
 * Chavetas equilibradas. Os meus próprios scripts de substituição já partiram
 * uma regra a meio duas vezes — e uma chaveta a mais faz o browser descartar
 * silenciosamente tudo o que vem a seguir no ficheiro. É a falha mais cara
 * possível numa folha de estilos, e a mais fácil de detetar.
 */
const desequilibradas = [];
for (const file of files) {
  const css = fs.readFileSync(file, "utf-8");
  let saldo = 0;
  let linha = 1;
  let fechoAMais = 0;
  for (const ch of css) {
    if (ch === "\n") linha += 1;
    if (ch === "{") saldo += 1;
    if (ch === "}") {
      saldo -= 1;
      if (saldo < 0 && !fechoAMais) fechoAMais = linha;
    }
  }
  if (saldo !== 0 || fechoAMais) {
    desequilibradas.push({ file: path.relative(ROOT, file), saldo, fechoAMais });
  }
}

/*
 * Classes `.bh-` declaradas e nunca aplicadas a um elemento. Foi assim que o
 * tema não apareceu da primeira vez: escrevi `.bh-piece` e `.bh-action` e não
 * os liguei a nenhum componente. CSS morto não dá erro — só faz o trabalho
 * parecer que não foi feito.
 */
const jsx = [];
(function reunir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) reunir(full);
    else if (/\.(tsx|jsx|ts)$/.test(entry.name)) jsx.push(fs.readFileSync(full, "utf-8"));
  }
})(CSS_DIR);
const markup = jsx.join("\n");
const classesBh = new Set([...source.matchAll(/\.(bh-[a-z0-9-]+)\s*[,{:]/g)].map((m) => m[1]));
const classesOrfas = [...classesBh].filter((cls) => !markup.includes(cls));

if (desequilibradas.length) {
  console.error("\nChavetas desequilibradas — o browser descarta o resto do ficheiro em silêncio:\n");
  for (const item of desequilibradas) {
    console.error(`  ${item.file}${item.fechoAMais ? ` — fecho a mais perto da linha ${item.fechoAMais}` : ` — saldo ${item.saldo}`}`);
  }
  console.error("");
  process.exit(1);
}

if (missing.length) {
  console.error(`\n${missing.length} token(s) usados sem estarem definidos — o CSS ignora-os em silêncio:\n`);
  for (const [token, file] of missing) console.error(`  ${token}\n    usado em ${file}`);
  console.error("");
  process.exit(1);
}

console.log(`[css] ${used.size} tokens usados, todos definidos · ${declared.size} declarados.`);
if (unused.length) console.log(`[css] ${unused.length} token(s) --bh- declarados e ainda sem uso: ${unused.join(", ")}`);
if (literals.size) console.log(`[css] ${literals.size} cor(es) literais fora da paleta.`);
if (classesOrfas.length) {
  console.log(`[css] ${classesOrfas.length} classe(s) .bh- sem nenhum elemento a usá-las: ${classesOrfas.join(", ")}`);
}
