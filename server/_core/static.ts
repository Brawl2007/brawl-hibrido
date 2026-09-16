import express, { type Express } from "express";
import fs from "fs";
import path from "path";
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

  app.use(servePrecompressed(distPath));
  app.use(express.static(distPath));

  // Fall through to index.html for client-side SPA routes.
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
