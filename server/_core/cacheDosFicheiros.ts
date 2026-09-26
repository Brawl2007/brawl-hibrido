import type { NextFunction, Request, Response } from "express";

/**
 * Quanto tempo cada ficheiro do site pode ficar guardado.
 *
 * Na Vercel o site inteiro passa pela função do Express, e o `express.static`
 * e o `sendFile` respondiam `Cache-Control: public, max-age=0` a tudo — até
 * aos ficheiros com o hash no nome, que nunca mudam. Resultado, visto no ar:
 * `x-vercel-cache: MISS` em cada pedido, cada ficheiro a acordar a função
 * (no arranque a frio, com o instalador das tabelas) e a atravessar o
 * Atlântico até `iad1`. No telemóvel, a primeira abertura pagava isso por
 * cada ficheiro.
 *
 * Com `s-maxage`, a própria Vercel guarda a resposta perto de quem pede e não
 * volta a chamar a função. A cache da Vercel é por publicação: uma versão
 * nova começa sempre limpa, por isso a página nunca fica presa numa versão
 * antiga.
 */
export function politicaDeCache(caminho: string): string {
  // O Vite põe o hash do conteúdo no nome: o mesmo nome é sempre o mesmo ficheiro.
  if (caminho.startsWith("/assets/")) return "public, max-age=31536000, s-maxage=31536000, immutable";
  // A página (e as rotas do site, que devolvem a mesma página): o browser
  // pergunta sempre se há nova; a Vercel responde da cache durante 5 minutos.
  const ultimo = caminho.split("/").pop() ?? "";
  if (!ultimo.includes(".") || ultimo.endsWith(".html")) return "public, max-age=0, s-maxage=300, must-revalidate";
  // Tipos de letra, logótipo, imagens: mudam raramente e sem hash no nome.
  return "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";
}

/** Põe o `Cache-Control` antes de servir; os servidores de ficheiros vêm com `cacheControl: false`. */
export function cabecalhosDeCache() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD") {
      if (!req.path.startsWith("/api/")) res.setHeader("Cache-Control", politicaDeCache(req.path));
    }
    next();
  };
}
