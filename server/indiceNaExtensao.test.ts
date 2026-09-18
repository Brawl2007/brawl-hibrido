import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lerIndiceTopBrawl } from "@shared/topBrawlParser";

/**
 * A extensão passou a ler uma coisa, e uma só: os ids do índice da rotação.
 *
 * POR QUE ISTO EXISTE
 *
 * A regra desta recolha sempre foi que a extensão não interpreta páginas — leva
 * o texto por interpretar e o servidor lê-o. Isso mantém um interpretador só,
 * num sítio só, com testes num sítio só.
 *
 * Abriu-se uma exceção, e vale a pena dizer o que ela comprou. A fila é
 * construída pelo site a partir da rotação que ele conhece, e o site só a
 * conhece depois de alguém lha importar. Quando dois mapas entram e dois saem,
 * a fila desse dia pede os que saíram e não pede os que entraram — foi
 * exatamente o que aconteceu: a rotação nova apareceu no site, e os dois mapas
 * novos ficaram sem uma única linha do TopBrawl.
 *
 * A alternativa era duas corridas, e a segunda não se faz: a primeira já disse
 * "Recolha concluída".
 *
 * O PREÇO DA EXCEÇÃO É ESTE TESTE
 *
 * Duas cópias da mesma leitura divergem sozinhas — uma é corrigida, a outra
 * fica. Aqui as duas são postas a ler os mesmos índices, e têm de responder o
 * mesmo. Se alguém mudar uma, este teste aponta a outra.
 */

const worker = readFileSync(resolve(process.cwd(), "client/public/brawlscope-helper/worker.js"), "utf8");

/** Tira a função do ficheiro da extensão, contando chavetas. */
function mapasDoIndiceDaExtensao(): (html: string) => string[] {
  const inicio = worker.indexOf("function mapasDoIndice(html) {");
  expect(inicio).toBeGreaterThan(-1);
  let profundidade = 0;
  let fim = inicio;
  for (let i = worker.indexOf("{", inicio); i < worker.length; i += 1) {
    if (worker[i] === "{") profundidade += 1;
    else if (worker[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) { fim = i + 1; break; }
    }
  }
  const codigo = worker.slice(inicio, fim);
  return new Function(`${codigo}; return mapasDoIndice;`)() as (html: string) => string[];
}

const daExtensao = mapasDoIndiceDaExtensao();

describe("o índice lido pela extensão e o lido pelo servidor", () => {
  const indices: Array<[string, string]> = [
    ["as duas formas de ligação", `<a href="https://topbrawl.com/rankeds/15000007">A</a><a href="/rankeds/15000010">B</a>`],
    ["o mesmo mapa repetido nas duas formas", `<a href="/rankeds/15000007">A</a><a href="https://topbrawl.com/rankeds/15000007">A</a>`],
    ["ligações com mais caminho a seguir", `<a href="https://topbrawl.com/rankeds/15000031?rows=106">A</a>`],
    ["um índice sem mapa nenhum", `<div>Sem rotação de momento.</div>`],
    ["ligações que não são de mapas", `<a href="/rankeds">Todos</a><a href="/sobre">Sobre</a>`],
  ];

  it.each(indices)("concordam sobre %s", (_nome, html) => {
    expect(daExtensao(html).sort()).toEqual(lerIndiceTopBrawl(html).sort());
  });

  it("concordam sobre um índice com a rotação inteira", () => {
    const ids = Array.from({ length: 27 }, (_, i) => `1500${String(i).padStart(4, "0")}`);
    const html = ids.map((id) => `<a href="/rankeds/${id}">Mapa ${id}</a>`).join("");
    expect(daExtensao(html).sort()).toEqual(ids.sort());
    expect(lerIndiceTopBrawl(html).sort()).toEqual(ids.sort());
  });
});
