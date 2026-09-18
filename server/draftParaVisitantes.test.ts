import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * O Draft é para os amigos, não só para o dono.
 *
 * POR QUE ISTO EXISTE
 *
 * A pergunta foi "os visitantes podem usar o Draft ou precisam de palavra-passe?".
 * Fui abrir o `/draft` num navegador sem sessão nenhuma e a resposta foi pior do
 * que "precisam": a pessoa era atirada para o formulário de entrada antes de ver
 * o tabuleiro. O `/`, o `/matchups` e o `/brawlers` abriam na mesma.
 *
 * Não havia regra nenhuma a proteger o Draft. Todas as perguntas de que ele
 * precisa para funcionar são públicas. O que acontecia era uma corrente de três
 * elos, em que nenhum estava errado sozinho:
 *
 *   1. a página do Draft perguntava pelo estado da chave da API oficial, que é
 *      do dono, em todos os carregamentos — mesmo com o painel fechado;
 *   2. o servidor recusava, e bem, a quem não entrou;
 *   3. um subscritor global lia qualquer recusa, de qualquer pergunta, como um
 *      pedido de entrada, e chamava o login.
 *
 * O resultado é o género de falha que ninguém reporta: o dono está sempre com
 * sessão iniciada e nunca a vê. Só quem não é dono é que a apanha — e quem não é
 * dono não tem como dizer que a apanhou.
 *
 * Este teste guarda os três elos, e guarda também a lista de perguntas que
 * draftar precisa de fazer: basta uma delas passar a protegida para o Draft
 * fechar outra vez, da mesma maneira e sem ninguém dar por isso.
 */

const raiz = process.cwd();
const ler = (caminho: string) => readFileSync(resolve(raiz, caminho), "utf8");

/**
 * Tira comentários antes de procurar.
 *
 * Já aconteceu neste projeto um teste destes passar por causa da explicação que
 * eu próprio tinha escrito por cima do código. O que vale é o código.
 */
function semComentarios(fonte: string) {
  /**
   * Linha a linha, de propósito. A primeira versão disto apagava tudo entre um
   * `/*` e o `*` seguinte com uma expressão regular sobre o ficheiro inteiro —
   * e este projeto tem `/*` dentro de textos e de endereços, por isso comia
   * centenas de linhas de código a meio e os testes passavam a procurar num
   * ficheiro mutilado. Neste código os comentários ocupam linhas inteiras.
   */
  const saida: string[] = [];
  let dentroDeBloco = false;
  for (const linha of fonte.split("\n")) {
    const limpa = linha.trim();
    if (dentroDeBloco) {
      if (limpa.endsWith("*/") || limpa.endsWith("*/}")) dentroDeBloco = false;
      continue;
    }
    if (limpa.startsWith("//")) continue;
    if (limpa.startsWith("/*") || limpa.startsWith("{/*")) {
      if (!(limpa.endsWith("*/") || limpa.endsWith("*/}"))) dentroDeBloco = true;
      continue;
    }
    if (limpa.startsWith("*")) continue;
    saida.push(linha);
  }
  return saida.join("\n");
}

const main = semComentarios(ler("client/src/main.tsx"));
const draft = semComentarios(ler("client/src/pages/Draft.tsx"));
const routers = semComentarios(ler("server/routers.ts"));
const app = semComentarios(ler("client/src/App.tsx"));

/** O corpo do `subscribe` de um dos caches, isolado do outro. */
function corpoDoSubscritor(qual: "getQueryCache" | "getMutationCache") {
  const inicio = main.indexOf(`queryClient.${qual}().subscribe`);
  expect(inicio, `${qual} devia estar subscrito em main.tsx`).toBeGreaterThan(-1);
  const fim = main.indexOf("});", inicio);
  return main.slice(inicio, fim);
}

describe("o Draft aberto a quem não é o dono", () => {
  it("uma pergunta recusada não manda ninguém para o formulário de entrada", () => {
    const perguntas = corpoDoSubscritor("getQueryCache");
    expect(perguntas).not.toContain("redirectToLoginIfUnauthorized");
    expect(perguntas).not.toContain("startLogin");
  });

  it("mas um clique num comando do dono continua a levar ao formulário", () => {
    /**
     * A diferença é entre uma pergunta que a página fez sozinha e um pedido que
     * a pessoa fez. No segundo caso, mostrar onde se entra é a resposta certa.
     */
    expect(corpoDoSubscritor("getMutationCache")).toContain("redirectToLoginIfUnauthorized");
  });

  it("a página do Draft não pergunta pela chave da API a quem não é dono", () => {
    const linha = draft.split("\n").find((l) => l.includes("syncJobs.apiKeyState.useQuery"));
    expect(linha, "a pergunta pela chave devia existir, para o dono").toBeDefined();
    expect(linha).toContain("enabled: ehDono");
  });

  it("a consola do dono não é mostrada a um visitante", () => {
    // O diagnóstico, a colagem de fichas e a chave da API vivem todos no mesmo
    // painel, e todos são recusados a quem não é dono. Botões assim não devem
    // estar lá.
    expect(draft).toMatch(/if \(!ehDono\)/);
  });

  it("o /draft não tem guarda nenhuma na rota — é público de propósito", () => {
    expect(app).toMatch(/<Route path="\/draft" component=\{Draft\} \/>/);
    expect(app).not.toMatch(/\/draft[\s\S]{0,120}(Redirect|requireAuth|protegid)/i);
  });

  it("tudo o que draftar precisa de perguntar é público", () => {
    /**
     * Esta lista não foi deduzida: é o que o navegador pediu ao carregar o
     * `/draft` sem sessão. Se alguma destas passar a protegida, o Draft deixa de
     * funcionar para os amigos dele.
     */
    const publicas = [
      ["auth", "me"],
      ["auth", "ownerLoginState"],
      ["rankedSync", "status"],
      ["rankedSync", "snapshot"],
      ["counterSync", "status"],
      ["counterSync", "snapshot"],
      ["counterSync", "matchups"],
      ["observedMatches", "status"],
      ["observedMatches", "matchup"],
      ["brawlApi", "events"],
      ["draftRoles", "list"],
      ["syncJobs", "state"],
      ["syncJobs", "database"],
    ] as const;

    for (const [grupo, nome] of publicas) {
      const inicio = routers.indexOf(`${grupo}: router({`);
      expect(inicio, `router ${grupo} não encontrado`).toBeGreaterThan(-1);
      const bloco = routers.slice(inicio, inicio + 40_000);
      const declaracao = new RegExp(`\\n\\s{4}${nome}: (public|protected)Procedure`).exec(bloco);
      expect(declaracao, `${grupo}.${nome} não encontrada`).not.toBeNull();
      expect(declaracao?.[1], `${grupo}.${nome} tem de ser pública`).toBe("public");
    }
  });

  it("o botão 'Atualizar agora' só aparece a quem o pode carregar", () => {
    /**
     * Está nas três barras de topo do site. Não é decoração: manda o servidor
     * ir ler as fontes, e é recusado a quem não é dono. Visível a um visitante,
     * era um botão que só servia para o expulsar da página — e no Draft, para
     * lhe apagar os picks já feitos.
     */
    for (const caminho of ["client/src/pages/Home.tsx", "client/src/pages/Draft.tsx", "client/src/pages/Brawlers.tsx"]) {
      const fonte = semComentarios(ler(caminho));
      expect(fonte, `${caminho} devia perguntar quem é o dono`).toContain("useEhDono()");
      const indice = fonte.indexOf('className="refresh-button"');
      expect(indice, `${caminho} devia ter o botão de atualizar`).toBeGreaterThan(-1);
      // O `ehDono ?` tem de estar mesmo antes do botão, não em qualquer sítio
      // do ficheiro: é a condição que o esconde.
      expect(fonte.slice(Math.max(0, indice - 200), indice)).toContain("ehDono ?");
    }
  });

  it("os comandos que mexem nos dados continuam a ser só do dono", () => {
    // O outro lado da mesma moeda: abrir o Draft não pode ter aberto isto.
    for (const nome of ["refresh", "probe", "setApiKey", "clearBackoff", "importPage", "clearImported"]) {
      const declaracoes = routers.match(new RegExp(`\\n\\s{4}${nome}: (public|protected)Procedure`, "g")) ?? [];
      expect(declaracoes.length, `${nome} não encontrada`).toBeGreaterThan(0);
      for (const d of declaracoes) expect(d).toContain("protectedProcedure");
    }
  });
});
