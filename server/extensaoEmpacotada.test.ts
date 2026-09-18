import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { crc32 } from "node:zlib";

/**
 * O ZIP da extensão tem de conter o que está no repositório.
 *
 * POR QUE ISTO EXISTE
 *
 * A extensão vive em duas formas: os ficheiros em `client/public/brawlscope-helper/`,
 * que são os que eu edito e os que os testes leem, e o `brawlscope-helper.zip`
 * ao lado, que é o que a pessoa descarrega e instala no Chrome.
 *
 * O ZIP é um ficheiro gravado, não é gerado no build. Ou seja: dá para corrigir
 * a extensão, ver os testes todos a passar, publicar — e entregar na mesma a
 * versão antiga, porque o ZIP ficou para trás. Nada assinalaria o erro. Quem
 * instalasse continuaria sem a correção, e a procura pela razão começaria no
 * código, que estava certo.
 *
 * Esta comparação é por CRC32, que é o que o próprio formato ZIP já guarda para
 * cada ficheiro: não é preciso descomprimir nada nem depender de um comando
 * externo estar instalado.
 */

const pasta = resolve(process.cwd(), "client/public/brawlscope-helper");
const zip = readFileSync(resolve(process.cwd(), "client/public/brawlscope-helper.zip"));

/** Lê o diretório central do ZIP: nome e CRC32 de cada entrada. */
function entradasDoZip(buffer: Buffer) {
  const entradas = new Map<string, number>();
  // Assinatura de uma entrada do diretório central.
  const ASSINATURA = 0x02014b50;
  for (let i = 0; i <= buffer.length - 46; i += 1) {
    if (buffer.readUInt32LE(i) !== ASSINATURA) continue;
    const crc = buffer.readUInt32LE(i + 16);
    const tamanhoNome = buffer.readUInt16LE(i + 28);
    const tamanhoExtra = buffer.readUInt16LE(i + 30);
    const tamanhoComentario = buffer.readUInt16LE(i + 32);
    const nome = buffer.subarray(i + 46, i + 46 + tamanhoNome).toString("utf8");
    entradas.set(nome, crc);
    i += 45 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  return entradas;
}

describe("o ZIP entregue é a extensão que está no repositório", () => {
  const noZip = entradasDoZip(zip);
  const naPasta = readdirSync(pasta).filter((nome) => !nome.startsWith("."));

  it("traz todos os ficheiros da pasta, e nenhum a mais", () => {
    expect([...noZip.keys()].sort()).toEqual([...naPasta].sort());
  });

  it.each(["queue.js", "capture.js", "worker.js", "panel.js", "manifest.json", "README.txt"])(
    "%s dentro do ZIP é igual ao do repositório",
    (nome) => {
      const conteudo = readFileSync(resolve(pasta, nome));
      expect(noZip.get(nome)).toBe(crc32(conteudo));
    },
  );

  /**
   * O nome e a versão no manifesto são o que a pessoa vê em chrome://extensions.
   * É por aí que ela confirma se recarregou mesmo a versão nova — e se ficarem
   * parados, deixa de haver forma de o saber sem ler código.
   */
  it("o nome e a versão do manifesto dizem a mesma coisa", () => {
    const manifesto = JSON.parse(readFileSync(resolve(pasta, "manifest.json"), "utf8")) as { version: string; name: string };
    expect(manifesto.version).toMatch(/^\d+\.\d+\.\d+$/);
    // Não se fixa um número aqui: o que não pode é o nome dizer uma versão e o
    // campo `version` dizer outra, porque é o nome que se lê em
    // chrome://extensions para confirmar que se recarregou a versão certa.
    const doNome = manifesto.name.match(/v(\d+)/)?.[1];
    expect(doNome).toBeDefined();
    expect(manifesto.version.startsWith(`${doNome}.`)).toBe(true);
  });
});
