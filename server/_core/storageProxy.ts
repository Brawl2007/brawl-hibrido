import type { Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { ENV } from "./env";

/**
 * Onde o site está publicado: o mesmo caminho que o `serveStatic` usa.
 */
function pastaPublica() {
  return process.env.VERCEL
    ? path.resolve(process.cwd(), "public")
    : path.resolve(process.cwd(), "dist", "public");
}

/**
 * Imagens que vieram da plataforma anterior.
 *
 * POR QUE ISTO MUDOU
 *
 * O logótipo, a imagem principal, o fundo dos mapas e a textura nunca
 * estiveram no repositório: ficaram alojados na Manus e eram pedidos a uma API
 * com chave. Fora dessa plataforma as duas variáveis não existem, e cada
 * imagem respondia 500.
 *
 * Isso não era só feio. Cada pedido destes é uma invocação de função — quatro
 * por cada carregamento de página, todas a falhar, e o navegador volta a
 * tentar. Gastava-se quota a servir erros.
 *
 * Agora há um caminho que não depende de ninguém: basta pôr os ficheiros em
 * `client/public/manus-storage/` e são servidos como qualquer outro recurso
 * estático, sem chave, sem API, sem função. O reencaminhamento para a
 * plataforma antiga fica como recurso para quem ainda tenha as variáveis.
 *
 * Sem ficheiro e sem variáveis, a resposta passa a ser 404 com cache: o
 * navegador percebe que não existe e deixa de insistir. Um 500 convida à
 * repetição; um 404 encerra o assunto.
 */
export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    /**
     * O nome vem do endereço, por isso não pode sair da pasta. `..` e caminhos
     * absolutos são recusados antes de tocar no disco.
     */
    const seguro = path.normalize(key).replace(/^(\.\.[/\\])+/, "");
    if (seguro.startsWith("..") || path.isAbsolute(seguro)) {
      res.status(400).send("Invalid storage key");
      return;
    }

    const local = path.join(pastaPublica(), "manus-storage", seguro);
    if (existsSync(local)) {
      res.sendFile(local);
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      // Um dia de cache evita repetir a pergunta a cada carregamento.
      res.set("Cache-Control", "public, max-age=86400");
      res.status(404).send("Storage asset not available");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
