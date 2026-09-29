import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { IP_DO_PROXY_ROYALEAPI, URL_PROXY_ROYALEAPI, normalizarCaminhoDaApi, setRuntimeApiVia, urlDaApi } from "./brawlStarsApi";

/**
 * A Vercel não tem IP de saída fixo e a Supercell prende a chave a IPs: a chave
 * era recusada com 403. O proxy da RoyaleAPI sai sempre do mesmo IP.
 */
describe("caminho da API oficial", () => {
  afterEach(() => {
    delete process.env.BRAWL_STARS_API_VIA;
    setRuntimeApiVia("oficial");
  });

  it("por omissão vai direto à Supercell", () => {
    expect(urlDaApi()).toBe("https://api.brawlstars.com/v1");
  });

  it("com o proxy ligado, todos os pedidos saem pela RoyaleAPI", () => {
    setRuntimeApiVia("royaleapi");
    expect(urlDaApi()).toBe(URL_PROXY_ROYALEAPI);
    expect(URL_PROXY_ROYALEAPI).toBe("https://bsproxy.royaleapi.dev/v1");
    expect(IP_DO_PROXY_ROYALEAPI).toBe("45.79.218.79");
  });

  it("a variável de ambiente manda sobre o que está guardado", () => {
    setRuntimeApiVia("oficial");
    process.env.BRAWL_STARS_API_VIA = "royaleapi";
    expect(urlDaApi()).toBe(URL_PROXY_ROYALEAPI);
  });

  it("qualquer valor estranho cai no caminho oficial", () => {
    expect(normalizarCaminhoDaApi("RoyaleAPI")).toBe("royaleapi");
    expect(normalizarCaminhoDaApi("outro")).toBe("oficial");
    expect(normalizarCaminhoDaApi(undefined)).toBe("oficial");
  });

  it("nenhum pedido à API usa o domínio oficial à mão", () => {
    const codigo = readFileSync(resolve(process.cwd(), "server/brawlStarsApi.ts"), "utf8");
    expect(codigo).not.toContain("${BASE_URL}");
    expect((codigo.match(/fetch\(`\$\{urlDaApi\(\)\}/g) ?? []).length).toBe(5);
    expect(readFileSync(resolve(process.cwd(), "server/sourceProbe.ts"), "utf8")).toContain("${urlDaApi()}/brawlers");
  });

  it("o arranque carrega o caminho guardado e o painel deixa mudá-lo", () => {
    expect(readFileSync(resolve(process.cwd(), "server/arranque.ts"), "utf8")).toContain("setRuntimeApiVia(via)");
    expect(readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8")).toContain("setApiVia: protectedProcedure");
    expect(readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8")).toContain("trpc.syncJobs.setApiVia.useMutation");
  });
});

describe("chave longa da Supercell", () => {
  it("aceita tokens com mais de 512 caracteres e tira os espaços colados", () => {
    const rotas = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const bloco = rotas.slice(rotas.indexOf("setApiKey: protectedProcedure"), rotas.indexOf("setApiVia: protectedProcedure") > rotas.indexOf("setApiKey: protectedProcedure") ? rotas.indexOf("setApiVia: protectedProcedure") : undefined);
    expect(bloco).toContain("z.string().max(4096)");
    expect(bloco).not.toContain("max(512)");
    expect(bloco).toContain('input.key.replace(/\\s+/g, "")');
  });
});
