import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RANKED_MAP_SOURCES } from "@shared/rankedMaps";
import { lerRotacaoGuardada, rotacaoUtilizavel, ROTACAO_GUARDADA_SETTING } from "@shared/rotacaoGuardada";
import { MIN_PLAUSIBLE_MAPS } from "@shared/rankedRotationSource";
// A extensão é servida como está, sem passar pelo build.
import { validateQueue } from "../client/public/brawlscope-helper/queue.js";

/**
 * A rotação mudou e o site não deu por nada.
 *
 * Entraram mapas novos, saíram outros, e a extensão continuou a recolher os
 * antigos — porque a fila saía de uma lista escrita à mão no projeto. Não foi
 * um descuido: é o que TEM de acontecer a cada rotação, porque a única página
 * que diz quais são os mapas de agora é o índice do TopBrawl, e esse responde
 * 403 a pedidos vindos do alojamento, tal como as páginas de cada mapa.
 *
 * O site nunca o vai conseguir ler sozinho. Mas abre no navegador de quem usa
 * o site, que é por onde os mapas já entram. Passa a entrar a rotação também.
 */
describe("a rotação passa a vir da extensão", () => {
  it("a fila aceita o índice da rotação, e não só as páginas de mapa", () => {
    const { urls } = validateQueue({
      format: "brawlhibrido-queue-v1",
      urls: ["https://topbrawl.com/rankeds", "https://topbrawl.com/rankeds/15000007?rows=106"],
    });
    expect(urls).toContain("https://topbrawl.com/rankeds");
    expect(urls).toHaveLength(2);
  });

  it("continua a recusar o que a recolha não sabe ler", () => {
    const bom = "https://topbrawl.com/rankeds/15000007?rows=106";
    for (const mau of [
      "https://topbrawl.com/rankeds?ordenar=1",
      "https://topbrawl.com/outra/coisa",
      "https://exemplo.test/rankeds",
    ]) {
      const { urls, rejeitados } = validateQueue({ format: "brawlhibrido-queue-v1", urls: [mau, bom] });
      // O que importa: a extensão nunca chega a VISITAR o que não conhece.
      expect(urls).toEqual([bom]);
      expect(rejeitados).toHaveLength(1);
    }
  });

  /**
   * O que aconteceu a sério, e que esta fila não pode voltar a fazer.
   *
   * O site aprendeu um endereço novo — o índice da rotação — e passou a pô-lo à
   * frente da fila. A extensão instalada não o conhecia, recusava-o, e com ele
   * deitava fora as outras duzentas: o ficheiro não carregava, o botão Iniciar
   * ficava cinzento, e a única pista era "Só páginas de mapa do TopBrawl" —
   * uma frase sobre um endereço, para um problema que era de versão.
   *
   * A propriedade que interessava (nunca visitar o que não se conhece) é
   * mantida recusando um a um. Deitar a fila fora não acrescentava segurança
   * nenhuma; só tornava a falha total e muda.
   */
  it("um endereço que esta versão não conhece não deita a fila toda fora", () => {
    const fila = [
      "https://topbrawl.com/qualquer-coisa-do-futuro",
      ...Array.from({ length: 26 }, (_, i) => `https://topbrawl.com/rankeds/150000${10 + i}?rows=106`),
    ];
    const { urls, rejeitados } = validateQueue({ format: "brawlhibrido-queue-v1", urls: fila });

    expect(urls).toHaveLength(26);
    expect(rejeitados).toHaveLength(1);
    expect(urls).not.toContain("https://topbrawl.com/qualquer-coisa-do-futuro");
  });

  /**
   * Quando NADA é reconhecido, a causa quase sempre é a versão — e a mensagem
   * tem de o dizer, em vez de falar do primeiro endereço da lista.
   */
  it("sem nada reconhecido, a mensagem aponta para a versão da extensão", () => {
    expect(() => validateQueue({
      format: "brawlhibrido-queue-v1",
      urls: ["https://topbrawl.com/futuro", "https://topbrawl.com/outro-futuro"],
    })).toThrow(/extensão está mais antiga do que o site/);
  });

  /**
   * A lista de recusados não pode virar uma porta das traseiras.
   *
   * O botão de repetição volta a pôr `errors` na fila. Se um endereço recusado
   * entrasse por aí, a extensão acabaria a visitar exatamente o que se recusou
   * a visitar — a validação deixaria de valer de nada.
   */
  it("os recusados ficam fora de errors, que é o que a repetição reutiliza", () => {
    const worker = readFileSync(resolve(process.cwd(), "client/public/brawlscope-helper/worker.js"), "utf8");
    expect(worker).toContain("errors: {}, rejeitados,");
    // E a repetição revalida, em vez de confiar na lista.
    expect(worker).toContain('validateQueue({ format: "brawlhibrido-queue-v1", urls: Object.keys(state.errors) })');
  });

  /**
   * O painel dizia "v61" enquanto o manifesto ia na 95. Quem seguisse a
   * instrução "confirma que diz v95" via v61 e concluía que a atualização tinha
   * falhado — podendo estar certa.
   */
  it("o painel mostra a versão do manifesto, não um número escrito à mão", () => {
    const panel = readFileSync(resolve(process.cwd(), "client/public/brawlscope-helper/panel.js"), "utf8");
    expect(panel).toContain("chrome.runtime.getManifest().version");
    const html = readFileSync(resolve(process.cwd(), "client/public/brawlscope-helper/panel.html"), "utf8");
    expect(html).not.toMatch(/v6\d/i);
  });

  /** Um botão cinzento sem explicação é indistinguível de um botão avariado. */
  it("o painel explica porque é que Iniciar está desativado", () => {
    const panel = readFileSync(resolve(process.cwd(), "client/public/brawlscope-helper/panel.js"), "utf8");
    expect(panel).toContain("porque-cinzento");
    expect(panel).toContain("ainda não há fila carregada");
  });

  /**
   * A extensão tem de reconhecer a página do índice como uma leitura sua.
   *
   * Sem este ramo, o índice caía no caminho das páginas de mapa, não
   * encontrava id nenhum no endereço e era contado como erro — três desses
   * seguidos param a fila inteira.
   */
  it("a extensão lê o índice por um caminho próprio", () => {
    const capture = readFileSync(resolve(process.cwd(), "client/public/brawlscope-helper/capture.js"), "utf8");
    expect(capture).toContain('location.pathname === "/rankeds"');
    expect(capture).toContain("rankedRotation");

    // E viaja no MESMO ficheiro dos mapas: um segundo ficheiro é um segundo
    // passo, e um segundo passo é um passo que se esquece.
    const panel = readFileSync(resolve(process.cwd(), "client/public/brawlscope-helper/panel.js"), "utf8");
    expect(panel).toContain("rotation: state.rankedRotation");
  });

  /**
   * A regra que impede o remédio de ser pior do que a doença.
   *
   * Um parser partido lê zero mapas. Zero mapas tomado por verdade significa
   * "a rotação acabou" — e o site apagaria a rotação inteira por causa de uma
   * mudança de formato na fonte.
   */
  it("uma leitura implausível não substitui a rotação guardada", () => {
    const poucos = { capturedAt: new Date().toISOString(), maps: Array.from({ length: MIN_PLAUSIBLE_MAPS - 1 }, (_, i) => ({ name: `Mapa ${i}`, id: `${i}` })) };
    expect(rotacaoUtilizavel(poucos)).toBe(false);
    expect(lerRotacaoGuardada(JSON.stringify(poucos))).toBeNull();
  });

  it.each([
    ["vazio", null],
    ["texto que não é JSON", "{{{"],
    ["JSON sem mapas", '{"capturedAt":"2026-09-18T00:00:00.000Z"}'],
    ["mapas sem id", '{"capturedAt":"2026-09-18T00:00:00.000Z","maps":[{"name":"X"}]}'],
  ])("não deixa um valor estragado (%s) derrubar a leitura", (_, bruto) => {
    expect(lerRotacaoGuardada(bruto)).toBeNull();
  });

  it("aceita uma leitura plausível e guarda quando foi lida", () => {
    const capturedAt = "2026-09-18T09:00:00.000Z";
    const maps = RANKED_MAP_SOURCES.map(([name, id, planetSlug]) => ({ name, id, planetSlug }));
    const lida = lerRotacaoGuardada(JSON.stringify({ capturedAt, maps }));
    expect(lida?.maps).toHaveLength(RANKED_MAP_SOURCES.length);
    expect(lida?.capturedAt).toBe(capturedAt);
  });

  it("a chave da definição não muda sem se dar por isso", () => {
    // Mudá-la esquece a rotação guardada e volta a pôr a lista do projeto no
    // comando, sem erro nenhum a assinalá-lo.
    expect(ROTACAO_GUARDADA_SETTING).toBe("rankedRotationCapture");
  });
});

/**
 * O que liga tudo: a fila tem de sair da rotação lida, não da lista do projeto,
 * e tem de levar o índice para se manter atual sozinha.
 */
describe("a fila de mapas segue a rotação de agora", () => {
  const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

  it("constrói a fila a partir da rotação guardada", () => {
    expect(routers).toContain("lerRotacaoGuardada(await getSetting(ROTACAO_GUARDADA_SETTING))");
  });

  it("põe o índice em todas as passagens", () => {
    // Se o índice sair da fila, a rotação congela na leitura que estava
    // guardada e o problema volta exatamente como estava.
    expect(routers).toContain('"https://topbrawl.com/rankeds",');
  });
});

describe("a sincronização usa a rotação lida no navegador", () => {
  beforeEach(() => vi.resetModules());

  it("cai na leitura da extensão quando o índice recusa o pedido", () => {
    const sync = readFileSync(resolve(process.cwd(), "server/rankedSync.ts"), "utf8");
    // Nos dois caminhos: índice ilegível e índice inacessível.
    expect(sync).toContain("const doNavegador = await rotacaoDoNavegador();");
    expect(sync).toContain("if (!lido.complete) return (await rotacaoDoNavegador()) ?? lido;");
  });
});
