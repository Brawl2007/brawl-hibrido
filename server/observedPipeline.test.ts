import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A recolha de batalhas reais tem de CORRER.
 *
 * Estava tudo construído — amostra dos jogadores do topo, leitura do histórico
 * de combates, deduplicação por impressão digital, agregação por mapa e modo —
 * mas só arrancava a partir de uma tarefa agendada externa que nunca chegou a
 * ser registada. Nunca correu uma única vez. A tabela ficou vazia desde sempre,
 * e o Draft dizia "Ainda não altera o Score" sobre dados que não existiam.
 *
 * É esta a resposta ao BrawlScope ter fechado a porta: em vez de depender de
 * quem nos pode recusar, o site constrói a sua própria matriz a partir de jogos
 * verdadeiros — e por mapa, mais fino do que o por modo que se perdeu.
 */
describe("recolha de batalhas Ranked reais", () => {
  const liveSync = readFileSync(resolve(process.cwd(), "server/liveSync.ts"), "utf8");

  it("corre no ciclo automático, não só numa tarefa agendada externa", () => {
    expect(liveSync).toContain("collectObservedRankedMatches");
    expect(liveSync).toMatch(/collectObservedRankedMatches\(trigger === "bootstrap" \? "bootstrap" : "scheduled"\)/);
  });

  it("é a última etapa do ciclo: pode faltar sem estragar o que já está no ecrã", () => {
    const posicaoCounters = liveSync.indexOf("syncCounterData");
    const posicaoBatalhas = liveSync.indexOf("collectObservedRankedMatches(trigger");
    expect(posicaoBatalhas).toBeGreaterThan(posicaoCounters);
  });

  it("uma falha na recolha não derruba o ciclo", () => {
    expect(liveSync).toMatch(/collectObservedRankedMatches[\s\S]*?catch \(error\)[\s\S]*?servidor continua ativo/);
  });

  it("distingue 'sem chave' de 'sem jogos'", () => {
    expect(liveSync).toContain("isOfficialApiConfigured()");
    expect(liveSync).toContain("sem chave da API oficial");

    const api = readFileSync(resolve(process.cwd(), "server/brawlStarsApi.ts"), "utf8");
    expect(api).toContain("export function isOfficialApiConfigured()");
  });

  it("o painel mostra o volume a crescer e o que falta para contar no Score", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
    expect(draftSource).toContain("Dados próprios");
    expect(draftSource).toContain("observedMatches.status.useQuery");
    // O limiar tem de estar dito: "ainda não conta" sem número é uma promessa vazia.
    expect(draftSource).toContain("30 observações");
    expect(draftSource).toContain("BRAWL_STARS_API_KEY");
  });

  it("o estado da recolha diz se a API oficial está configurada", () => {
    const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(routers).toContain("officialApiConfigured: isOfficialApiConfigured()");
  });
});

/**
 * O IP de saída.
 *
 * A chave da API oficial fica presa ao IP declarado ao criá-la. Quem aloja o
 * site não sabe qual é, e sem ele a chave é recusada com 403 — o mesmo sintoma
 * de um bloqueio de fonte, com outra causa e outra solução.
 */
describe("descobrir o IP de saída do servidor", () => {
  const probe = readFileSync(resolve(process.cwd(), "server/sourceProbe.ts"), "utf8");

  it("faz parte do diagnóstico e aparece primeiro", () => {
    expect(probe).toContain("probeEgressIp");
    // Primeiro na lista: é o passo que desbloqueia a configuração.
    expect(probe).toMatch(/results: \[egresso, /);
  });

  it("diz para que serve, não só o número", () => {
    expect(probe).toContain("é este que tens de declarar ao criar a chave");
  });

  it("não pode fazer falhar o diagnóstico das fontes", () => {
    // Um serviço de IP em baixo não pode esconder o estado do BrawlScope.
    expect(probe).toMatch(/probeEgressIp[\s\S]*?catch \(error\)[\s\S]*?return \{ source: "Servidor/);
  });
});

/**
 * Verificar a chave da API oficial num clique.
 *
 * As funções normais engolem o erro e devolvem lista vazia. Isso é seguro em
 * produção e inútil para diagnosticar: "sem dados" tem três causas — chave em
 * falta, chave errada, ou IP declarado diferente do IP do servidor — e cada uma
 * resolve-se de forma diferente.
 *
 * A do IP é a mais provável e a menos óbvia: a Supercell prende cada chave a um
 * IP, e o IP de um alojamento na nuvem pode mudar num reinício.
 */
describe("teste da chave da API oficial", () => {
  const api = readFileSync(resolve(process.cwd(), "server/brawlStarsApi.ts"), "utf8");
  const probe = readFileSync(resolve(process.cwd(), "server/sourceProbe.ts"), "utf8");

  it("distingue as três causas em vez de devolver lista vazia", () => {
    expect(api).toContain("export async function probeOfficialApi()");
    // No 403, a Supercell diz no corpo qual foi o IP que viu — é essa a
    // resposta que conta, não a de um serviço externo de "qual é o meu IP".
    expect(api).toMatch(/res\.status === 403[\s\S]{0,1600}viu o pedido vir de/);
    expect(api).toContain("a chave aceita vários IPs");
    expect(api).toMatch(/res\.status === 401[\s\S]{0,200}inválida ou foi revogada/);
    // A mensagem deixou de mandar a pessoa para o ambiente: agora há um campo
    // no próprio site, que é o caminho de quem não chega à plataforma.
    expect(api).toContain("Ainda não há chave da API oficial.");
  });

  it("mostra o IP que a Supercell viu, numa linha fácil de copiar", () => {
    expect(api).toMatch(/corpo\.match\(/);
    expect(api).toContain("seenIp");
    expect(probe).toContain("IP a acrescentar à chave");
  });

  it("aparece no diagnóstico logo depois do IP de saída", () => {
    // As duas linhas lêem-se juntas: o 403 aqui explica-se com o IP de lá.
    expect(probe).toMatch(/results: \[egresso, oficial,/);
  });

  it("uma chave em falta é aviso, uma chave recusada é falha", () => {
    // Sem chave ainda não se configurou nada; com chave recusada há algo errado.
    expect(probe).toMatch(/resultado\.ok \? "ok" : resultado\.configured \? "fail" : "warn"/);
  });
});
