import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Uma base de dados em falta não pode fechar o site.
 *
 * O erro que o utilizador viu era este:
 *
 *   Failed query: select `id`, ... from `ranked_sync_config` where id = ?
 *
 * A página de Início pede a configuração e a última snapshot mal abre. Numa
 * instalação nova — tabelas por criar — essas consultas rebentavam, o erro subia
 * até ao cliente, e o SITE INTEIRO deixava de carregar.
 *
 * E é uma falha absurda: o site tem o catálogo do projeto embutido e não precisa
 * da base de dados para mostrar nada. Ela só guarda o que as recolhas trazem
 * DEPOIS. Sem ela, os números são os do repositório — antigos, mas certos.
 */
describe("o site aguenta a base de dados em baixo", () => {
  const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");

  it("as leituras que abrem a página passam todas pelo envelope tolerante", () => {
    for (const leitura of [
      "ensureRankedSyncConfig",
      "getRankedSyncConfig",
      "getRankedSyncSnapshot",
      "getCounterSyncSnapshot",
      "getCounterSyncConfig",
      "listRankedSyncRuns",
      "listCounterSyncRuns",
    ]) {
      expect(db).toContain(`lerDaBase("${leitura}"`);
    }
  });

  it("o envelope devolve o valor de recurso em vez de propagar o erro", () => {
    expect(db).toMatch(/async function lerDaBase[\s\S]*?catch \(error\)[\s\S]*?return recurso;/);
  });

  it("avisa uma vez por operação, não a cada pedido", () => {
    // Um site com a base de dados em baixo faria centenas de pedidos por minuto.
    expect(db).toContain("avisosDados.has(operacao)");
    expect(db).toContain("avisosDados.add(operacao)");
  });

  it("o aviso diz o que fazer numa instalação nova", () => {
    expect(db).toContain("pnpm db:push");
  });

  it("as ESCRITAS continuam a falhar em voz alta", () => {
    // Engolir um erro de escrita esconderia dados perdidos — o oposto do que se quer.
    expect(db).not.toContain('lerDaBase("upsertRankedSyncSnapshot"');
    expect(db).not.toContain('lerDaBase("upsertCounterSyncSnapshot"');
    expect(db).not.toContain('lerDaBase("recordObservedBattle"');
  });

  it("há um diagnóstico que diz se a base de dados responde", () => {
    expect(db).toContain("export async function checkDatabase()");

    const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(routers).toContain("database: publicProcedure.query(() => checkDatabase())");

    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
    expect(draftSource).toContain("Base de dados inacessível");
    expect(draftSource).toContain("pnpm db:push");
  });
});
