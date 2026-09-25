import type { Express } from "express";
import { idDeImagemValido, imagemDaBrawlify } from "../terrenoDoMapa";

/*
 * Imagens da Brawlify servidas pelo próprio site, para o quadro 3D as poder
 * pôr numa textura: o WebGL só aceita imagens de outro domínio quando esse
 * domínio o autoriza. Só ids numéricos e só estes dois tipos — o servidor não
 * vai buscar endereços que lhe mandem. Ver `server/terrenoDoMapa.ts`.
 */
export function registarImagensDaBrawlify(app: Express) {
  app.get("/api/imagens/:tipo/:ficheiro", async (req, res) => {
    const tipo = req.params.tipo === "mapa" || req.params.tipo === "brawler" ? req.params.tipo : null;
    const id = /^(\d+)\.png$/.exec(req.params.ficheiro)?.[1] ?? "";
    if (!tipo || !idDeImagemValido(id)) {
      res.status(404).end();
      return;
    }
    const imagem = await imagemDaBrawlify(tipo, id);
    if (!imagem) {
      res.status(502).end();
      return;
    }
    res.setHeader("content-type", imagem.tipo);
    res.setHeader("cache-control", "public, max-age=86400, s-maxage=604800");
    res.end(imagem.dados);
  });
}
