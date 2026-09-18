import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

/**
 * O runtime do Manus passou a ser opcional.
 *
 * Era um import fixo. Enquanto o site viveu no Manus isso não custava nada; num
 * alojamento onde o pacote não esteja instalado, o mesmo import rebenta a
 * leitura do ficheiro de configuração — e o build falha antes de compilar uma
 * única linha do site, com um erro que não diz nada sobre o site.
 *
 * Carregado assim, continua a entrar onde existe (nada muda para quem ficou no
 * Manus) e desaparece em silêncio onde não existe. `DISABLE_MANUS_RUNTIME=1`
 * desliga-o mesmo estando instalado.
 */
async function carregarRuntimeManus(): Promise<Plugin[]> {
  if (process.env.DISABLE_MANUS_RUNTIME === "1") return [];
  try {
    const modulo = await import("vite-plugin-manus-runtime");
    return [modulo.vitePluginManusRuntime() as Plugin];
  } catch {
    return [];
  }
}

/**
 * A configuração é assíncrona porque o runtime do Manus é carregado a pedido.
 *
 * O Vite aceita uma função que devolve a configuração, e é essa a forma
 * documentada de esperar por alguma coisa aqui — mais segura do que um `await`
 * à cabeça do ficheiro, que depende de como cada versão o compila.
 */
/**
 * Tira do HTML a etiqueta de analytics quando ela não está configurada.
 *
 * POR QUE ISTO EXISTE
 *
 * O `index.html` traz `<script src="%VITE_ANALYTICS_ENDPOINT%/umami">`. O Vite
 * substitui `%VAR%` pelas variáveis que existem — e quando a variável NÃO
 * existe, deixa o texto tal e qual. O resultado foi para produção: o navegador
 * de cada visitante pedia literalmente
 *
 *     /%VITE_ANALYTICS_ENDPOINT%/umami
 *
 * e levava 400. Um pedido falhado e um erro na consola, em cada carregamento,
 * para toda a gente, desde que isto foi publicado. Não parte nada — e é
 * precisamente por não partir nada que ninguém reparou.
 *
 * Com a variável definida, a etiqueta fica e passa a apontar para o sítio
 * certo. Sem ela, não se serve uma etiqueta que não pode funcionar.
 */
function vitePluginAnalyticsOpcional(): Plugin {
  return {
    name: "analytics-opcional",
    transformIndexHtml(html) {
      if (process.env.VITE_ANALYTICS_ENDPOINT) return html;
      return html.replace(/\s*<script[^>]*%VITE_ANALYTICS_ENDPOINT%[^>]*><\/script>/g, "");
    },
  };
}

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), jsxLocPlugin(), ...(await carregarRuntimeManus()), vitePluginManusDebugCollector(), vitePluginAnalyticsOpcional()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, process.env.VERCEL === "1" ? "public" : "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
}));
