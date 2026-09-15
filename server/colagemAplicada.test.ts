import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DA COLAGEM ATÉ AO SCORE
 *
 * Colar uma ficha grava a matriz no servidor. Isso não chega: os números só
 * contam quando chegam ao Draft e ao perfil do brawler. Entre uma coisa e a
 * outra havia três pontos onde o caminho se cortava, e nenhum deles dava erro —
 * a pessoa colava, via "105 confrontos lidos", e depois não via mudar nada.
 */
const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf-8");

describe("os valores colados chegam ao Draft e aos perfis", () => {
  it("o perfil do brawler carrega as matrizes, e não só o Draft", () => {
    const perfil = ler("client/src/pages/BrawlerDetail.tsx");
    expect(perfil).toContain("useBrawlScopeLiveMatchups");
    // O perfil lê os confrontos com getMatchupValue, que consulta essas matrizes.
    expect(perfil).toContain("getMatchupValue");
  });

  it("o perfil refaz-se quando uma matriz nova chega", () => {
    const perfil = ler("client/src/pages/BrawlerDetail.tsx");
    expect(perfil).toMatch(/matrizesVivas\.version/);
  });

  it("colar invalida todas as vistas, não só a geral", () => {
    const draft = ler("client/src/pages/Draft.tsx");
    // Sem isto, colar a ficha de um modo não mudava nada durante cinco minutos.
    expect(draft).toContain("utilsColagem.counterSync.matchups.invalidate()");
    const depoisDeColar = draft.slice(draft.indexOf("importPage.useMutation"));
    expect(depoisDeColar.slice(0, 900)).toContain("matchups.invalidate()");
  });

  it("apagar as fichas coladas também limpa as matrizes em cache", () => {
    const draft = ler("client/src/pages/Draft.tsx");
    const depoisDeApagar = draft.slice(draft.indexOf("clearImported.useMutation"));
    expect(depoisDeApagar.slice(0, 700)).toContain("matchups.invalidate()");
  });

  it("o hook pede um desenho novo depois de guardar as matrizes", () => {
    const hook = ler("client/src/lib/brawlScopeMatchups.ts");
    // As matrizes vivem fora do React: sem isto, quem lê durante o desenho em
    // que elas chegam ainda lê as antigas.
    expect(hook).toContain("setAplicadas");
    expect(hook).toMatch(/version: `\$\{aplicadas\}/);
  });

  it("a rota das matrizes é pública — o Draft lê-as sem sessão", () => {
    const routers = ler("server/routers.ts");
    expect(routers).toMatch(/matchups: publicProcedure/);
  });
});

/**
 * AS LISTAS DO PERFIL VÊM DA SNAPSHOT, NÃO DA MATRIZ
 *
 * São dois caminhos diferentes e só um deles era imediato. A matriz — de onde
 * saem as percentagens de cada confronto — recebia a ficha colada na hora. As
 * listas de counters que o perfil mostra vêm da snapshot publicada, e a
 * snapshot só se refaz quando corre um ciclo de recolha: até quinze minutos
 * depois, ou nunca, se o site reiniciasse pelo meio.
 *
 * Quem colava via os números certos no Draft e as listas antigas no perfil.
 */
describe("colar refaz a snapshot publicada", () => {
  it("a importação arranca a republicação em segundo plano", () => {
    const routers = ler("server/routers.ts");
    const importacao = routers.slice(routers.indexOf("importPage: protectedProcedure"));
    const bloco = importacao.slice(0, 2400);
    expect(bloco).toContain("startSyncJob(COUNTER_SYNC_JOB");
    expect(bloco).toContain("republishing");
  });

  it("não espera pela republicação para responder", () => {
    const routers = ler("server/routers.ts");
    const importacao = routers.slice(routers.indexOf("importPage: protectedProcedure"), routers.indexOf("clearImported:"));
    // `await startSyncJob(...)` deixava a caixa de colar parada minutos a fio —
    // exatamente o defeito que o botão "Atualizar agora" já teve.
    expect(importacao).not.toMatch(/await\s+startSyncJob/);
  });

  it("o trabalho em curso absorve uma segunda colagem em vez de duplicar a recolha", () => {
    const jobs = ler("server/syncJobs.ts");
    expect(jobs).toContain("alreadyRunning: true");
  });
});

/**
 * O MESMO MODO COM DOIS NOMES
 *
 * O projeto chama ao mesmo modo "gemGrab" (nome editorial do BrawlScope, com
 * que as matrizes são guardadas) e "gem-grab" (nome do Ranked, com que os mapas
 * são identificados). O cliente pedia a matriz pelo segundo; o servidor
 * procurava pelo primeiro, à letra, e devolvia vazio.
 *
 * Consequência: nenhuma matriz POR MODO chegava ao ecrã — nem no perfil, nem no
 * Draft. Colava-se uma ficha de Pique-Gema, ficava bem guardada, e não mudava
 * nada, porque ninguém a sabia pedir. E não havia erro: um pedido a uma vista
 * que não existe responde "sem dados", que é indistinguível de "ainda não
 * colaste nada".
 */
describe("as duas grafias do mesmo modo", () => {
  it("o servidor aceita a grafia do Ranked e a do BrawlScope", async () => {
    const { normalizarVistaBrawlScope } = await import("./counterSync");
    expect(normalizarVistaBrawlScope("gem-grab")).toBe("gemGrab");
    expect(normalizarVistaBrawlScope("gemGrab")).toBe("gemGrab");
    expect(normalizarVistaBrawlScope("brawl-ball")).toBe("brawlBall");
    expect(normalizarVistaBrawlScope("hot-zone")).toBe("hotZone");
    expect(normalizarVistaBrawlScope("overall")).toBe("overall");
  });

  it("uma vista desconhecida fica como veio, em vez de virar outra qualquer", async () => {
    const { normalizarVistaBrawlScope } = await import("./counterSync");
    expect(normalizarVistaBrawlScope("modo-que-nao-existe")).toBe("modo-que-nao-existe");
  });

  it("a rota devolve a vista normalizada, que é a chave com que o cliente a guarda", () => {
    const routers = ler("server/routers.ts");
    expect(routers).toContain("normalizarVistaBrawlScope(input?.view ?? \"overall\")");
  });

  it("o cliente guarda a matriz pela chave canónica", async () => {
    const { setBrawlScopeLiveMatchups, getBrawlScopeLiveViews } = await import("@shared/counterMatchupValue");
    setBrawlScopeLiveMatchups("gem-grab", { Shelly: { Mortis: -6.4 } });
    expect(getBrawlScopeLiveViews()).toContain("gemGrab");
    setBrawlScopeLiveMatchups("gem-grab", null);
    expect(getBrawlScopeLiveViews()).not.toContain("gemGrab");
  });

  it("guardada por uma grafia, encontra-se pela outra", async () => {
    const { setBrawlScopeLiveMatchups, setBrawlScopeReading, getMatchupValue } = await import("@shared/counterMatchupValue");
    setBrawlScopeReading("byMode");
    setBrawlScopeLiveMatchups("gem-grab", { Shelly: { Mortis: -6.4 } });
    // O Draft pergunta pelo modo do mapa, que vem em "gem-grab".
    const valor = getMatchupValue("Shelly", "Mortis", "gem-grab");
    expect(valor.total).not.toBe(0);
    setBrawlScopeLiveMatchups("gem-grab", null);
  });
});

/**
 * DE ONDE VIERAM ESTES NÚMEROS
 *
 * "Os valores não estão a atualizar no perfil" não se conseguia investigar: o
 * ecrã mostrava exactamente a mesma coisa quer estivesse a ler uma ficha
 * colada, quer o catálogo do repositório. Não havia como distinguir "a colagem
 * não chegou aqui" de "a colagem chegou e os números são mesmo estes".
 */
describe("a origem dos números é visível", () => {
  it("o painel da matriz diz se está a usar ficha colada ou catálogo", () => {
    const perfil = ler("client/src/pages/BrawlerDetail.tsx");
    expect(perfil).toContain("Origem: ficha colada");
    expect(perfil).toContain("Origem: catálogo do repositório");
    expect(perfil).toContain("value.live");
  });

  it("a cobertura por brawler deixou de ler só o catálogo", async () => {
    const fonte = ler("shared/counterMatchupValue.ts");
    // Lia sempre `brawlScopeMatchupDeltas`, e uma ficha acabada de colar não
    // mexia num único número desta leitura.
    expect(fonte).toContain("function tabelaDoDono");
    const cobertura = fonte.slice(fonte.indexOf("export function getBrawlScopeCoverage"));
    expect(cobertura.slice(0, 300)).toContain("tabelaDoDono(owner, modeId)");
  });

  it("a ficha colada ganha ao catálogo, como no Score", async () => {
    const { setBrawlScopeLiveMatchups, setBrawlScopeReading, getBrawlScopeCoverage } = await import("@shared/counterMatchupValue");
    setBrawlScopeReading("byMode");
    setBrawlScopeLiveMatchups("overall", { Bibi: { Mortis: -6.4, Piper: 3.2, Frank: 0 } });
    const cobertura = getBrawlScopeCoverage("Bibi");
    expect(cobertura.published).toBe(true);
    expect(cobertura.total).toBe(3);
    expect(cobertura.live).toBe(true);
    setBrawlScopeLiveMatchups("overall", null);
  });

  it("mostra os nomes dos adversários como a fonte os escreve", async () => {
    const { setBrawlScopeLiveMatchups, getBrawlScopeCoverage } = await import("@shared/counterMatchupValue");
    setBrawlScopeLiveMatchups("overall", { Bibi: { "Mr. P": -8.1, "Larry & Lawrie": 2.0 } });
    const cobertura = getBrawlScopeCoverage("Bibi");
    // Sem os nomes guardados, isto sairia "mrp" e "larrylawrie".
    expect([cobertura.hardest?.brawler, cobertura.easiest?.brawler]).toContain("Mr. P");
    setBrawlScopeLiveMatchups("overall", null);
  });
});

/**
 * "NENHUMA FICHA COLADA" NÃO PODE SER METADE DA FRASE
 *
 * Caso real: o Griff foi colado em Nocaute e o perfil estava aberto em Geral.
 * A leitura caiu no catálogo — correctamente — e a linha dizia apenas que
 * nenhuma ficha estava a ser usada. A conclusão óbvia era que a colagem se
 * tinha perdido, e mandou-me procurar um defeito que não existia.
 *
 * A ficha existia. Faltava dizer onde.
 */
describe("o perfil diz onde é que a ficha existe", () => {
  const perfil = () => ler("client/src/pages/BrawlerDetail.tsx");

  it("pergunta ao servidor em que vistas existe ficha deste brawler", () => {
    const fonte = perfil();
    expect(fonte).toContain("trpc.counterSync.colagemFeita.useQuery");
    expect(fonte).toContain("vistasComFicha");
  });

  it("distingue 'ainda não colaste' de 'está noutro modo'", () => {
    const fonte = perfil();
    expect(fonte).toContain("Ainda não colaste a ficha deste brawler.");
    expect(fonte).toContain("Mas há ficha colada dele em:");
  });

  it("mostra o nome do modo, não o identificador interno", () => {
    const fonte = perfil();
    // "gemGrab" não diz nada a ninguém; "Pique-Gema" diz.
    expect(fonte).toContain("rotuloDaVista");
    expect(fonte).toMatch(/brawlScopeModes\.find\(\(modo\) => modo\.id === vista\)\?\.label/);
  });

  it("confirma a forma do que recebe antes de o percorrer", () => {
    // A mesma lição do erro que derrubou o Draft: o que vem do servidor é
    // verificado antes de ser tratado como lista.
    expect(perfil()).toContain("Array.isArray(nomes)");
  });
});
