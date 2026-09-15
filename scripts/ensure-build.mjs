#!/usr/bin/env node
/**
 * Guarda de publicação.
 *
 * O problema que isto resolve é concreto e já aconteceu: a pasta `dist/` pode
 * ficar para trás do código-fonte. Quando isso acontece, o servidor arranca sem
 * qualquer erro e serve uma versão antiga do site — ou, pior, um `index.html`
 * que aponta para ficheiros `/assets/...` que não existem, o que dá um ecrã
 * branco. Nenhum dos dois casos se distingue de um deploy bem-sucedido.
 *
 * Corre automaticamente antes de `pnpm start`. Se o build estiver em falta ou
 * desatualizado, reconstrói. Se não conseguir reconstruir, falha com uma
 * mensagem clara em vez de deixar arrancar algo errado.
 *
 * Está encadeado com `&&` dentro do próprio script `start`, e não como um
 * `prestart`: desde a versão 7 o pnpm ignora os scripts `pre`/`post` por
 * omissão, e a guarda nunca chegaria a correr sem ninguém reparar — o que era
 * exatamente o tipo de falha silenciosa que ela existe para evitar.
 *
 * Para saltar a verificação (por exemplo, num ambiente onde o build é feito
 * noutra etapa do pipeline): SKIP_BUILD_CHECK=1 pnpm start
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_BUNDLE = path.join(ROOT, "dist", "index.js");
const CLIENT_INDEX = path.join(ROOT, "dist", "public", "index.html");

/** Pastas cujo conteúdo entra no build. Uma alteração aqui invalida o `dist/`. */
const SOURCE_DIRS = ["client", "server", "shared", "scripts"];
const SOURCE_FILES = ["package.json", "vite.config.ts", "tsconfig.json"];
const IGNORED_DIRS = new Set(["node_modules", "dist", ".git", ".manus-logs", "__pycache__"]);

const BUILD_STAMP = path.join(ROOT, "dist", "build-source.sha256");

// O ZIP e o transporte do build podem alterar datas. Compara conteúdo.
function sourceFingerprint() {
  const hash = createHash("sha256");
  const visit = (relative) => {
    const absolute = path.join(ROOT, relative);
    if (!fs.existsSync(absolute)) return;
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      if (IGNORED_DIRS.has(path.basename(relative))) return;
      for (const child of fs.readdirSync(absolute).sort()) visit(path.join(relative, child));
    } else if (stat.isFile()) {
      const bytes = fs.readFileSync(absolute);
      hash.update(JSON.stringify([relative.split(path.sep).join("/"), bytes.length]));
      hash.update(bytes);
    }
  };
  for (const entry of [...SOURCE_DIRS, ...SOURCE_FILES, "pnpm-lock.yaml", "patches"].sort()) visit(entry);
  return hash.digest("hex");
}

/**
 * Um `index.html` só vale se os ficheiros que ele carrega existirem mesmo. É
 * exatamente esta verificação que apanha o ecrã branco.
 */
function missingAssets() {
  if (!fs.existsSync(CLIENT_INDEX)) return ["dist/public/index.html"];
  const html = fs.readFileSync(CLIENT_INDEX, "utf-8");
  const referenced = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  return referenced.filter((asset) => !fs.existsSync(path.join(ROOT, "dist", "public", asset)));
}

function describeReason() {
  if (!fs.existsSync(SERVER_BUNDLE)) return "não existe `dist/index.js` — o servidor nunca foi compilado";
  const faltam = missingAssets();
  if (faltam.length) {
    return `o index.html publicado aponta para ficheiros que não existem (${faltam.slice(0, 3).join(", ")})`;
  }

  const recorded = fs.existsSync(BUILD_STAMP) ? fs.readFileSync(BUILD_STAMP, "utf8").trim() : "";
  if (recorded !== sourceFingerprint()) {
    return "o conteúdo do código difere do build, ou falta a assinatura do build";
  }
  return null;
}

function main() {
  if (process.argv.includes("--stamp")) {
    if (!fs.existsSync(SERVER_BUNDLE) || missingAssets().length) {
      throw new Error("Não é possível assinar um build incompleto.");
    }
    fs.writeFileSync(BUILD_STAMP, sourceFingerprint() + "\n");
    console.log("[build] Assinatura do código guardada.");
    return;
  }
  if (process.env.SKIP_BUILD_CHECK === "1") {
    console.log("[build] verificação saltada (SKIP_BUILD_CHECK=1).");
    return;
  }

  const reason = describeReason();
  if (!reason) {
    console.log("[build] `dist/` está atualizado.");
    return;
  }

  console.log(`[build] É preciso reconstruir: ${reason}.`);
  console.log("[build] A correr `npm run build`…");
  try {
    execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
  } catch {
    console.error("");
    console.error("──────────────────────────────────────────────────────────────");
    console.error(" O build falhou e o site NÃO pode ser publicado assim.");
    console.error("");
    console.error(` Motivo da reconstrução: ${reason}.`);
    console.error("");
    console.error(" Servir a pasta `dist/` como está publicaria uma versão antiga");
    console.error(" ou um ecrã em branco, sem dar erro nenhum. Por isso paramos aqui.");
    console.error("");
    console.error(" O que fazer:");
    console.error("   1. pnpm install        (as dependências de build são precisas)");
    console.error("   2. pnpm build");
    console.error("   3. pnpm start");
    console.error("──────────────────────────────────────────────────────────────");
    process.exit(1);
  }

  const aindaFalha = describeReason();
  if (aindaFalha) {
    console.error(`[build] O build correu mas o resultado continua inválido: ${aindaFalha}.`);
    process.exit(1);
  }
  console.log("[build] Reconstruído com sucesso.");
}

main();
