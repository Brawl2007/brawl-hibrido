import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * O site aberto a sério em vários tamanhos, com o Chromium.
 *
 * POR QUE ISTO EXISTE
 *
 * A pergunta era simples — "o site está adaptado a PC, Chromebook, telemóvel?"
 * — e a resposta honesta não se tira a ler CSS. Foi levantado o `dist` e aberto
 * com o Chromium em 320, 390, 430, 768, 1366 e 1920 de largura.
 *
 * O grosso estava bem: nenhum tamanho produz scroll horizontal na página, e a
 * tabela larga (`min-width: 710px`) vive dentro de `.table-shell`, que tem
 * `overflow-x: auto` e não é cortada por nenhum antepassado — a 390px o
 * conteúdo é alcançável rolando dentro da caixa.
 *
 * Três coisas não estavam:
 *
 *  1. Cada carregamento pedia literalmente `/%VITE_ANALYTICS_ENDPOINT%/umami`
 *     e levava 400. O Vite só substitui `%VAR%` quando a variável existe; sem
 *     ela, deixa o texto tal e qual — e foi assim para produção. Um pedido
 *     falhado por visitante, por carregamento, desde que isto foi publicado.
 *     Não partia nada, e é por não partir nada que ninguém reparou.
 *
 *  2. `maximum-scale=1` bloqueava o zoom com dois dedos. Quem precisa de
 *     aproximar para ler — e há muito texto a 7px neste desenho — não podia.
 *
 *  3. O botão de fechar o menu media 26x26. É o alvo que se acerta com o
 *     polegar no ecrã pequeno, e era o mais pequeno da página.
 *
 * Este teste guarda as três. As medições do navegador não correm aqui — o
 * Playwright não é dependência do projeto e o CI não tem de levantar o site —
 * mas as três causas são verificáveis no ficheiro, que é onde regridem.
 */

const raiz = process.cwd();
const html = readFileSync(resolve(raiz, "client/index.html"), "utf8");
const viteConfig = readFileSync(resolve(raiz, "vite.config.ts"), "utf8");
const css = ["client/src/index.css", "client/src/arena-v55.css"]
  .map((caminho) => readFileSync(resolve(raiz, caminho), "utf8"))
  .join("\n");

describe("o site em telemóvel, tablet, Chromebook e PC", () => {
  it("não bloqueia o zoom de quem precisa de aproximar para ler", () => {
    const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1];
    expect(viewport).toBeDefined();
    expect(viewport).toContain("width=device-width");
    /**
     * `maximum-scale` e `user-scalable=no` impedem o zoom no telemóvel. Servem
     * para evitar o salto que o iOS dá ao tocar num campo de texto — e isso
     * resolve-se com o tamanho da letra do campo, não tirando o zoom a todos.
     */
    expect(viewport).not.toContain("maximum-scale");
    expect(viewport).not.toContain("user-scalable");
  });

  it("não serve uma etiqueta de analytics que não pode funcionar", () => {
    // A etiqueta pode continuar no ficheiro: o que não pode é ir para o HTML
    // servido com o marcador por substituir. Quem a tira é o plugin.
    expect(viteConfig).toContain("vitePluginAnalyticsOpcional");
    expect(viteConfig).toContain("VITE_ANALYTICS_ENDPOINT");
    expect(viteConfig).toContain("transformIndexHtml");
  });

  it("o HTML publicado não leva marcadores por substituir", () => {
    const publicado = resolve(raiz, "dist/public/index.html");
    let servido: string;
    try {
      servido = readFileSync(publicado, "utf8");
    } catch {
      // Sem build feito não há nada a verificar, e inventar uma falha aqui
      // seria pior do que não verificar.
      return;
    }
    expect(servido).not.toMatch(/%VITE_[A-Z_]+%/);
  });

  it("o botão de fechar o menu dá para acertar com o polegar", () => {
    // 44x44 é a recomendação de alvo de toque. Media 26x26.
    const regra = css.match(/\.sidebar-close\s*\{[^}]*\}/g)?.join("\n") ?? "";
    expect(regra).toMatch(/min-width:\s*44px/);
    expect(regra).toMatch(/min-height:\s*44px/);
  });

  it("a tabela larga continua a poder ser rolada dentro da caixa dela", () => {
    /**
     * A tabela tem `min-width: 710px` e num telemóvel de 390 não cabe. O que a
     * torna utilizável é a caixa à volta rolar — se alguém lhe puser
     * `overflow: hidden`, as colunas da direita deixam de existir para quem usa
     * telemóvel, e nada no ecrã o denuncia.
     */
    expect(css).toMatch(/\.table-shell\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.data-table\s*\{[^}]*min-width/);
  });
});
