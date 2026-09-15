import fs from "fs";
import path from "path";
import type { NextFunction, Request, Response } from "express";

/**
 * Tipos de conteúdo por extensão, para os ficheiros pré-comprimidos. Quando se
 * serve `index-abc.js.gz`, o Express já não consegue adivinhar o tipo a partir
 * do nome — acabaria a dizer que um bundle de JavaScript é um ficheiro `.gz`,
 * e o browser recusava-o.
 */
const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

/**
 * Serve as versões pré-comprimidas geradas por `scripts/precompress.mjs`.
 *
 * Os catálogos de dados do projeto (rotação ranked, deltas do BrawlScope,
 * relações do Brawl Planet) são texto muito repetitivo e encolhem cerca de 90%.
 * Sem isto, um telemóvel em dados móveis descarrega perto de 1 MB antes de ver
 * o primeiro pixel.
 *
 * Só entra em ação quando o ficheiro comprimido existe mesmo e o browser o
 * anunciou em `Accept-Encoding`; em qualquer outro caso deixa passar para o
 * `express.static` normal. É por isso que não pode partir nada: na pior das
 * hipóteses não faz nada.
 */
export function servePrecompressed(distPath: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    const accepted = String(req.headers["accept-encoding"] ?? "");
    const candidates: Array<{ encoding: string; suffix: string }> = [];
    if (/\bbr\b/.test(accepted)) candidates.push({ encoding: "br", suffix: ".br" });
    if (/\bgzip\b/.test(accepted)) candidates.push({ encoding: "gzip", suffix: ".gz" });
    if (!candidates.length) return next();

    // `decodeURIComponent` pode lançar em URLs inválidas; aí seguimos em frente.
    let pathname: string;
    try {
      pathname = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    if (pathname.includes("\0")) return next();

    const original = path.join(distPath, pathname);
    // Impede que um `..` no caminho saia da pasta publicada.
    if (!original.startsWith(distPath)) return next();

    const extension = path.extname(original);
    const contentType = CONTENT_TYPES[extension];
    if (!contentType) return next();

    for (const candidate of candidates) {
      const compressed = `${original}${candidate.suffix}`;
      const stat = fs.existsSync(compressed) ? fs.statSync(compressed) : null;
      if (!stat || !stat.isFile()) continue;

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Encoding", candidate.encoding);
      res.setHeader("Content-Length", String(stat.size));
      // Caches intermédias têm de saber que a resposta depende do pedido.
      res.setHeader("Vary", "Accept-Encoding");
      /**
       * `acceptRanges: false` é deliberado: um pedido Range sobre o ficheiro
       * comprimido devolveria um pedaço dos bytes comprimidos, e o browser
       * espera um pedaço do ficheiro original. Os bundles não são pedidos por
       * troços, por isso o custo é nenhum e evita um erro muito difícil de ver.
       */
      return res.sendFile(compressed, { acceptRanges: false }, (error) => {
        if (error) next(error);
      });
    }

    return next();
  };
}
