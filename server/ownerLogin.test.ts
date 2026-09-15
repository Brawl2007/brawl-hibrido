import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OWNER_LOGIN_OPEN_ID, OWNER_LOGIN_PATH } from "@shared/ownerLogin";
import { checkOwnerPassword, isOwnerPasswordConfigured, isOwnerPasswordStrongEnough, resetOwnerLoginThrottle } from "./ownerLogin";

/**
 * Entrada do dono por palavra-passe.
 *
 * Substitui o login do Manus, que deixa de funcionar assim que o site muda de
 * endereço. Sem entrada não há "Atualizar agora", nem diagnóstico, nem colar
 * fichas — por isso o que aqui se testa não é um detalhe de autenticação, é o
 * acesso do dono ao próprio site.
 */
const original = process.env.OWNER_PASSWORD;

beforeEach(() => {
  resetOwnerLoginThrottle();
  delete process.env.OWNER_PASSWORD;
});

afterEach(() => {
  resetOwnerLoginThrottle();
  if (original === undefined) delete process.env.OWNER_PASSWORD;
  else process.env.OWNER_PASSWORD = original;
});

describe("palavra-passe do dono", () => {
  it("sem OWNER_PASSWORD definida, diz que não está configurada em vez de 'errada'", () => {
    expect(isOwnerPasswordConfigured()).toBe(false);
    const resultado = checkOwnerPassword("seja o que for");
    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.reason).toBe("not-configured");
  });

  it("recusa uma palavra-passe curta definida no alojamento, e diz que o problema é essa", () => {
    process.env.OWNER_PASSWORD = "1234";
    expect(isOwnerPasswordConfigured()).toBe(true);
    expect(isOwnerPasswordStrongEnough()).toBe(false);
    const resultado = checkOwnerPassword("1234");
    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.reason).toBe("too-short");
  });

  it("aceita a palavra-passe certa", () => {
    process.env.OWNER_PASSWORD = "arena-legendaria-2026";
    expect(checkOwnerPassword("arena-legendaria-2026").ok).toBe(true);
  });

  it("recusa a errada, e também o que não é texto", () => {
    process.env.OWNER_PASSWORD = "arena-legendaria-2026";
    expect(checkOwnerPassword("arena-legendaria-2025").ok).toBe(false);
    expect(checkOwnerPassword("").ok).toBe(false);
    expect(checkOwnerPassword(undefined).ok).toBe(false);
    expect(checkOwnerPassword(123456789).ok).toBe(false);
    expect(checkOwnerPassword({ password: "arena-legendaria-2026" }).ok).toBe(false);
  });

  it("distingue maiúsculas de minúsculas", () => {
    process.env.OWNER_PASSWORD = "arena-legendaria-2026";
    expect(checkOwnerPassword("Arena-Legendaria-2026").ok).toBe(false);
  });
});

/**
 * O endereço do site é público e o formulário tem um campo só. Sem travão, uma
 * máquina experimenta milhares de palavras por minuto contra ele.
 */
describe("travão de tentativas", () => {
  it("bloqueia à quinta tentativa falhada", () => {
    process.env.OWNER_PASSWORD = "arena-legendaria-2026";
    for (let tentativa = 1; tentativa <= 4; tentativa += 1) {
      const resultado = checkOwnerPassword("errada");
      expect(resultado.ok === false && resultado.reason).toBe("wrong");
    }
    const quinta = checkOwnerPassword("errada");
    expect(quinta.ok === false && quinta.reason).toBe("locked");
    expect(quinta.ok === false && (quinta.retryAfterMs ?? 0)).toBeGreaterThan(0);
  });

  it("durante o bloqueio recusa até a palavra-passe certa", () => {
    process.env.OWNER_PASSWORD = "arena-legendaria-2026";
    for (let tentativa = 1; tentativa <= 5; tentativa += 1) checkOwnerPassword("errada");
    const resultado = checkOwnerPassword("arena-legendaria-2026");
    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.reason).toBe("locked");
  });

  it("passado o tempo do bloqueio, a palavra-passe certa volta a entrar", () => {
    process.env.OWNER_PASSWORD = "arena-legendaria-2026";
    const inicio = 1_000_000;
    for (let tentativa = 1; tentativa <= 5; tentativa += 1) checkOwnerPassword("errada", inicio);
    expect(checkOwnerPassword("arena-legendaria-2026", inicio + 61_000).ok).toBe(true);
  });

  it("cada série de enganos custa o dobro da anterior", () => {
    process.env.OWNER_PASSWORD = "arena-legendaria-2026";
    let agora = 1_000_000;
    const esperar = () => {
      let ultimo = 0;
      for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
        const resultado = checkOwnerPassword("errada", agora);
        if (resultado.ok === false && resultado.reason === "locked") ultimo = resultado.retryAfterMs ?? 0;
      }
      agora += ultimo + 1_000;
      return ultimo;
    };
    const primeiro = esperar();
    const segundo = esperar();
    expect(segundo).toBe(primeiro * 2);
  });

  it("uma entrada certa limpa a contagem de enganos anteriores", () => {
    process.env.OWNER_PASSWORD = "arena-legendaria-2026";
    for (let tentativa = 1; tentativa <= 4; tentativa += 1) checkOwnerPassword("errada");
    expect(checkOwnerPassword("arena-legendaria-2026").ok).toBe(true);
    for (let tentativa = 1; tentativa <= 4; tentativa += 1) {
      const resultado = checkOwnerPassword("errada");
      expect(resultado.ok === false && resultado.reason).toBe("wrong");
    }
  });
});

/**
 * As ligações entre as peças. São verificadas na fonte porque o que falha aqui
 * não falha em silêncio numa função: falha no site inteiro, com o dono à porta.
 */
describe("ligações da entrada do dono", () => {
  // A raiz do projeto, como nas outras suites: `__dirname` aponta para a pasta
  // compilada e não encontrava a fonte.
  const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf-8");

  it("o site reconhece como dono quem entra pela palavra-passe", () => {
    const db = ler("server/db.ts");
    expect(db).toContain("OWNER_LOGIN_OPEN_ID");
    expect(db).toMatch(/user\.openId === OWNER_LOGIN_OPEN_ID/);
  });

  it("a sessão do dono não vai pedir nada ao servidor do Manus", () => {
    const sdk = ler("server/_core/sdk.ts");
    const posicaoDono = sdk.indexOf("sessionUserId === OWNER_LOGIN_OPEN_ID");
    const posicaoOAuth = sdk.indexOf("// If user not in DB, sync from OAuth server automatically");
    expect(posicaoDono).toBeGreaterThan(0);
    // A recuperação do dono tem de vir ANTES do recurso ao OAuth, senão nunca corre.
    expect(posicaoDono).toBeLessThan(posicaoOAuth);
  });

  it("a entrada é pública — exigir sessão para criar a sessão fecharia a porta por fora", () => {
    const routers = ler("server/routers.ts");
    expect(routers).toMatch(/ownerLogin: publicProcedure/);
    expect(routers).toMatch(/ownerLoginState: publicProcedure/);
  });

  it("o botão de entrar leva ao formulário quando não há OAuth do Manus configurado", () => {
    const constantes = ler("client/src/const.ts");
    expect(constantes).toContain("OWNER_LOGIN_PATH");
    expect(constantes).toMatch(/if \(!oauthPortalUrl \|\| !appId\)/);
  });

  it("a página de entrada está registada na rota que o botão usa", () => {
    const app = ler("client/src/App.tsx");
    expect(app).toContain(`path="${OWNER_LOGIN_PATH}"`);
    expect(OWNER_LOGIN_OPEN_ID).toBe("owner_local");
  });

  it("o build não parte onde o runtime do Manus não existe", () => {
    const vite = ler("vite.config.ts");
    expect(vite).not.toMatch(/^import .*vite-plugin-manus-runtime/m);
    expect(vite).toContain("carregarRuntimeManus");
  });
});
