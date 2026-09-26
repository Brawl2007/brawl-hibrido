import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { cabecalhosDeCache } from "./cacheDosFicheiros";
import { servePrecompressed } from "./precompressedStatic";

export function serveStatic(app: Express) {
  const distPath =
    process.env.VERCEL === "1"
      ? path.resolve(process.cwd(), "public")
      : process.env.NODE_ENV === "development"
        ? path.resolve(import.meta.dirname, "../..", "dist", "public")
        : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // O tempo de cache de cada ficheiro (ver cacheDosFicheiros.ts): sem isto
  // tudo saía com max-age=0 e a Vercel não guardava nada.
  app.use(cabecalhosDeCache());
  app.use(servePrecompressed(distPath));
  app.use(express.static(distPath, { cacheControl: false }));

  // Fall through to index.html for client-side SPA routes.
  app.use("*", (req, res) => {
    // Um ficheiro com hash que já não existe (de uma versão anterior) não é
    // uma página: responder com o index.html, guardado um ano, estragava-o.
    if (req.originalUrl.startsWith("/assets/")) {
      res.setHeader("Cache-Control", "no-store");
      res.status(404).end();
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"), { cacheControl: false });
  });
}
