import { describe, expect, it } from "vitest";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { politicaDeCache } from "./_core/cacheDosFicheiros";
import { serveStatic } from "./_core/static";

describe("quanto tempo cada ficheiro fica guardado", () => {
  it("os ficheiros com hash guardam-se um ano; a página pergunta sempre", () => {
    expect(politicaDeCache("/assets/index-BKnL0puv.js")).toContain("immutable");
    expect(politicaDeCache("/assets/index-BKnL0puv.js")).toContain("s-maxage=31536000");
    expect(politicaDeCache("/")).toBe("public, max-age=0, s-maxage=300, must-revalidate");
    expect(politicaDeCache("/draft")).toBe("public, max-age=0, s-maxage=300, must-revalidate");
    expect(politicaDeCache("/brawlers/El%20Primo")).toBe("public, max-age=0, s-maxage=300, must-revalidate");
    expect(politicaDeCache("/index.html")).toContain("max-age=0");
    expect(politicaDeCache("/tipos/lilita-one-400.woff2")).toContain("max-age=86400");
    expect(politicaDeCache("/marca/logo-provisorio.svg")).toContain("s-maxage=604800");
  });

  it("no servidor a sério: o cabeçalho chega ao browser e um ficheiro antigo dá 404", async () => {
    // Com VERCEL=1, o serveStatic serve a pasta `public` da pasta atual.
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "cache-"));
    fs.mkdirSync(path.join(raiz, "public", "assets"), { recursive: true });
    fs.writeFileSync(path.join(raiz, "public", "index.html"), "<!doctype html><p>ok</p>");
    fs.writeFileSync(path.join(raiz, "public", "assets", "app-abc123.js"), "console.log(1)");
    const antes = process.env.VERCEL;
    process.env.VERCEL = "1";
    const cwd = process.cwd();
    process.chdir(raiz);
    const app = express();
    serveStatic(app);
    process.chdir(cwd);
    const servidor = app.listen(0);
    try {
      const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
      const js = await fetch(`${base}/assets/app-abc123.js`);
      expect(js.status).toBe(200);
      expect(js.headers.get("cache-control")).toContain("immutable");
      const pagina = await fetch(`${base}/draft`);
      expect(pagina.status).toBe(200);
      expect(pagina.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=300, must-revalidate");
      const velho = await fetch(`${base}/assets/app-velho999.js`);
      expect(velho.status).toBe(404);
      expect(velho.headers.get("cache-control")).toBe("no-store");
    } finally {
      servidor.close();
      if (antes === undefined) delete process.env.VERCEL; else process.env.VERCEL = antes;
    }
  });
});
