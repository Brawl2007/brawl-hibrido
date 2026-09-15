import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VERSAO_DO_SITE } from "@shared/version";

/**
 * Ver `shared/version.ts`: sem o número à vista, a primeira pergunta de cada
 * problema — "esta é a versão nova?" — não tinha resposta sem ir a registos de
 * build, e perdia-se tempo a corrigir coisas já corrigidas.
 */
describe("versão à vista no site", () => {
  const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf-8");

  it("tem um número de versão declarado", () => {
    expect(VERSAO_DO_SITE).toMatch(/^v\d+$/);
  });

  it("aparece em todas as páginas, e não só numa", () => {
    const app = ler("client/src/App.tsx");
    expect(app).toContain("<VersaoDoSite />");
    // Fora do <Switch>: dentro, só apareceria na página que estivesse aberta.
    expect(app.indexOf("<VersaoDoSite />")).toBeGreaterThan(app.indexOf("</Switch>"));
  });

  it("lê a constante em vez de trazer o número escrito à mão", () => {
    const carimbo = ler("client/src/components/VersaoDoSite.tsx");
    expect(carimbo).toContain("VERSAO_DO_SITE");
    expect(carimbo).not.toMatch(/"v\d+"/);
  });

  it("não tapa o que está por baixo", () => {
    expect(ler("client/src/components/VersaoDoSite.tsx")).toContain("pointer-events-none");
  });
});

/**
 * A versão tem de ser legível DE FORA, não só no canto do ecrã.
 *
 * O canto do ecrã resolve para quem está ao computador. Para quem está a
 * diagnosticar à distância, não: obrigava a pedir a alguém que fosse olhar, e
 * uma resposta errada aí faz corrigir outra vez o que já estava corrigido.
 */
describe("versão legível de fora", () => {
  const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf-8");

  it("vai no estado público, que não exige sessão", () => {
    const routers = ler("server/routers.ts");
    expect(routers).toContain("versao: VERSAO_DO_SITE");
    // No `status`, que é publicProcedure — num endpoint protegido não serviria
    // para diagnosticar de fora.
    const posicao = routers.indexOf("versao: VERSAO_DO_SITE");
    const statusPublico = routers.lastIndexOf("status: publicProcedure", posicao);
    const protegidoAntes = routers.lastIndexOf("protectedProcedure", posicao);
    expect(statusPublico).toBeGreaterThan(protegidoAntes);
  });

  it("é escrita no arranque, para aparecer no registo da publicação", () => {
    expect(ler("server/_core/index.ts")).toContain("Versão ${VERSAO_DO_SITE} em execução");
  });
});
