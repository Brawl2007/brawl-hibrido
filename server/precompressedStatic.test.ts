import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { servePrecompressed } from "./_core/precompressedStatic";

/**
 * O site envia cerca de 1 MB de catálogos de dados. Comprimidos são uns 100 KB,
 * e é isso que `scripts/precompress.mjs` prepara no build. Este middleware é a
 * outra metade: escolher o ficheiro certo sem nunca servir a coisa errada.
 *
 * O que se testa aqui é sobretudo o que ele NÃO pode fazer — servir bytes
 * comprimidos a quem não os pediu, deixar o Content-Type errado, ou permitir
 * sair da pasta publicada.
 */

const dist = fs.mkdtempSync(path.join(os.tmpdir(), "precompress-"));
const conteudo = "export const catalogo = [1, 2, 3];\n".repeat(100);

type Resposta = {
  headers: Record<string, string>;
  sent: string | null;
  options: Record<string, unknown> | null;
};

function chamar(pathname: string, acceptEncoding?: string, method = "GET") {
  const middleware = servePrecompressed(dist);
  const res: Resposta = { headers: {}, sent: null, options: null };
  let seguiu = false;

  const req = { method, path: pathname, headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {} };
  const express = {
    setHeader: (name: string, value: string) => { res.headers[name] = value; },
    sendFile: (file: string, options: Record<string, unknown>) => { res.sent = file; res.options = options; },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  middleware(req as any, express as any, (() => { seguiu = true; }) as any);
  return { res, seguiu };
}

beforeAll(() => {
  fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
  const alvo = path.join(dist, "assets", "index-abc.js");
  fs.writeFileSync(alvo, conteudo);
  fs.writeFileSync(`${alvo}.gz`, zlib.gzipSync(conteudo));
  fs.writeFileSync(`${alvo}.br`, zlib.brotliCompressSync(conteudo));
  // Um ficheiro sem versão comprimida, para confirmar o caminho normal.
  fs.writeFileSync(path.join(dist, "assets", "sozinho.css"), "body{color:red}");
});

afterAll(() => fs.rmSync(dist, { recursive: true, force: true }));

describe("estáticos pré-comprimidos", () => {
  it("prefere brotli quando o browser aceita os dois", () => {
    const { res, seguiu } = chamar("/assets/index-abc.js", "gzip, deflate, br");

    expect(seguiu).toBe(false);
    expect(res.sent).toBe(path.join(dist, "assets", "index-abc.js.br"));
    expect(res.headers["Content-Encoding"]).toBe("br");
    // Sem isto, o browser recebia um bundle anunciado como ficheiro `.br`.
    expect(res.headers["Content-Type"]).toBe("text/javascript; charset=utf-8");
    // Caches intermédias servem a mesma URL a browsers com suporte diferente.
    expect(res.headers.Vary).toBe("Accept-Encoding");
    expect(res.options).toMatchObject({ acceptRanges: false });
  });

  it("cai para gzip quando é o único aceite", () => {
    const { res } = chamar("/assets/index-abc.js", "gzip");

    expect(res.sent).toBe(path.join(dist, "assets", "index-abc.js.gz"));
    expect(res.headers["Content-Encoding"]).toBe("gzip");
    expect(Number(res.headers["Content-Length"])).toBe(fs.statSync(path.join(dist, "assets", "index-abc.js.gz")).size);
  });

  it("nunca serve bytes comprimidos a quem não os pediu", () => {
    // O erro mais caro possível seria este: o cliente recebia lixo binário.
    const { res, seguiu } = chamar("/assets/index-abc.js");

    expect(seguiu).toBe(true);
    expect(res.sent).toBeNull();
    expect(res.headers["Content-Encoding"]).toBeUndefined();
  });

  it("segue em frente quando não existe versão comprimida", () => {
    const { seguiu, res } = chamar("/assets/sozinho.css", "gzip, br");

    expect(seguiu).toBe(true);
    expect(res.sent).toBeNull();
  });

  it("não deixa sair da pasta publicada nem responde a métodos de escrita", () => {
    expect(chamar("/../../etc/passwd", "gzip").seguiu).toBe(true);
    expect(chamar("/assets/index-abc.js", "gzip", "POST").seguiu).toBe(true);
  });

  it("aguenta uma URL mal formada em vez de rebentar o pedido", () => {
    expect(() => chamar("/assets/%E0%A4%A.js", "gzip")).not.toThrow();
    expect(chamar("/assets/%E0%A4%A.js", "gzip").seguiu).toBe(true);
  });
});
