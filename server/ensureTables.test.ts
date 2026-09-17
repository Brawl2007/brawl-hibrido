import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPAROS_DE_ENUM, apenasCriacoes, instrucaoDeAlargamento, separarInstrucoes, valoresDoEnum } from "./ensureTables";

/**
 * Ver o cabeçalho de `ensureTables.ts`: num alojamento gratuito não há terminal
 * para correr `pnpm db:push`, e sem tabelas o site guarda tudo em lado nenhum.
 */
const instalador = () => readFileSync(resolve(process.cwd(), "drizzle/criar-tabelas.sql"), "utf-8");

describe("instalador das tabelas no arranque", () => {
  it("lê todas as criações do ficheiro", () => {
    const criacoes = apenasCriacoes(separarInstrucoes(instalador()));
    const noFicheiro = (instalador().match(/CREATE TABLE IF NOT EXISTS/gi) ?? []).length;
    expect(criacoes.length).toBe(noFicheiro);
    expect(criacoes.length).toBeGreaterThan(10);
  });

  it("cria as tabelas de que o site se queixa quando faltam", () => {
    const criacoes = apenasCriacoes(separarInstrucoes(instalador())).join("\n");
    for (const tabela of ["users", "ranked_sync_config", "counter_sync_snapshots", "observed_battles"]) {
      expect(criacoes).toContain(`\`${tabela}\``);
    }
  });

  it("todas usam IF NOT EXISTS — correr no arranque não pode tocar no que já lá está", () => {
    for (const instrucao of apenasCriacoes(separarInstrucoes(instalador()))) {
      expect(instrucao).toMatch(/^CREATE TABLE IF NOT EXISTS/i);
    }
  });

  it("deixa de fora tudo o que não seja criar uma tabela", () => {
    const misturado = [
      "CREATE TABLE IF NOT EXISTS `users` (`id` int);",
      "DROP TABLE `users`;",
      "ALTER TABLE `users` ADD COLUMN `x` int;",
      "TRUNCATE TABLE `users`;",
      "CREATE TABLE `sem_guarda` (`id` int);",
    ].join("\n");
    const passaram = apenasCriacoes(separarInstrucoes(misturado));
    expect(passaram).toHaveLength(1);
    expect(passaram[0]).toContain("IF NOT EXISTS");
  });

  it("o arranque chama o instalador antes de qualquer recolha", () => {
    const arranque = readFileSync(resolve(process.cwd(), "server/arranque.ts"), "utf-8");
    expect(arranque).toContain("ensureTables()");
    expect(arranque.indexOf("ensureTables()")).toBeLessThan(arranque.indexOf("getStoredApiKey()"));
  });

  /**
   * A falha que este teste existe para impedir.
   *
   * Criar as tabelas estava só no `startLiveSync()`, e o `startLiveSync()` só é
   * chamado pelo servidor de sempre. A entrada da Vercel é outra e nunca lá
   * chegava: uma tabela nova no instalador nunca era criada em produção, e a
   * primeira gravação que dela dependesse falhava com um erro de SQL — depois
   * de o site ter subido e de parecer estar bem.
   *
   * As DUAS entradas têm de chegar ao mesmo arranque. Não basta uma.
   */
  it("as duas entradas do servidor garantem o arranque, não só a de sempre", () => {
    const vercel = readFileSync(resolve(process.cwd(), "server/_core/index.vercel.ts"), "utf-8");
    const sempre = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf-8");
    const liveSync = readFileSync(resolve(process.cwd(), "server/liveSync.ts"), "utf-8");

    // A Vercel não tem processo de pé: pendura o arranque no primeiro pedido.
    expect(vercel).toContain("garantirArranque()");
    // O servidor de sempre chega lá pelo startLiveSync().
    expect(sempre).toContain("startLiveSync()");
    expect(liveSync).toContain("garantirArranque()");
  });
});

/**
 * O ERRO QUE ISTO APANHOU
 *
 * Com a base de dados criada de raiz no alojamento novo, a recolha corria bem —
 * o painel dava PL Prodigy a verde, com 1632 relações — e a gravação das provas
 * falhava logo a seguir: `Failed query: insert into counter_sync_relation_evidence`.
 * A coluna `source` tinha sido criada a aceitar três fontes e o código escrevia
 * quatro. A que faltava era justamente a maior.
 *
 * `CREATE TABLE IF NOT EXISTS` nunca iria corrigir isto, porque a tabela existe.
 */
describe("reparo de colunas já criadas", () => {
  it("a fonte prodigy passou a constar do instalador", () => {
    const sqlInstalador = readFileSync(resolve(process.cwd(), "drizzle/criar-tabelas.sql"), "utf-8");
    const linha = sqlInstalador.split("\n").find((l) => l.includes("`source` enum") && l.includes("brawlscope"));
    expect(linha).toContain("'prodigy'");
  });

  it("o esquema e o instalador declaram as mesmas fontes", () => {
    const esquema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf-8");
    const noEsquema = /mysqlEnum\("source", \[([^\]]*brawlscope[^\]]*)\]/.exec(esquema)?.[1] ?? "";
    const valores = Array.from(noEsquema.matchAll(/"([^"]+)"/g)).map((p) => p[1]).sort();
    expect(valores).toEqual(["brawlscope", "calculator", "planet", "prodigy"]);
  });

  it("alarga a coluna quando falta um valor", () => {
    const reparo = REPAROS_DE_ENUM[0];
    const instrucao = instrucaoDeAlargamento(reparo, "enum('brawlscope','calculator','planet')");
    expect(instrucao).toContain("MODIFY COLUMN `source`");
    expect(instrucao).toContain("'prodigy'");
    expect(instrucao).toContain("NOT NULL");
  });

  it("não faz nada quando a coluna já aceita tudo — correr ao arranque não pode mexer no que está bem", () => {
    const reparo = REPAROS_DE_ENUM[0];
    expect(instrucaoDeAlargamento(reparo, "enum('brawlscope','calculator','planet','prodigy')")).toBeUndefined();
    // A ordem não importa: o que conta é o conjunto.
    expect(instrucaoDeAlargamento(reparo, "enum('prodigy','planet','calculator','brawlscope')")).toBeUndefined();
  });

  it("conserva valores que a base tem e o código já não usa", () => {
    const reparo = REPAROS_DE_ENUM[0];
    const instrucao = instrucaoDeAlargamento(reparo, "enum('brawlscope','calculator','planet','antigo')") ?? "";
    expect(instrucao).toContain("'antigo'");
    expect(instrucao).toContain("'prodigy'");
  });

  it("nunca apaga, nunca larga, nunca trunca", () => {
    // Sem os comentários: as explicações falam de DROP e de ALTER de propósito,
    // e é o código executável que interessa aqui.
    const fonte = readFileSync(resolve(process.cwd(), "server/ensureTables.ts"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
    expect(fonte).not.toMatch(/\bDROP\b/i);
    expect(fonte).not.toMatch(/\bTRUNCATE\b/i);
    expect(fonte).not.toMatch(/\bDELETE FROM\b/i);
    // O único ALTER é o que alarga um enum.
    const alteracoes = fonte.match(/ALTER TABLE/gi) ?? [];
    expect(alteracoes).toHaveLength(1);
  });

  it("desiste em silêncio se não conseguir ler a definição da coluna", () => {
    const reparo = REPAROS_DE_ENUM[0];
    expect(instrucaoDeAlargamento(reparo, "")).toBeUndefined();
    expect(instrucaoDeAlargamento(reparo, "varchar(64)")).toBeUndefined();
  });

  it("lê os valores de uma definição do MySQL", () => {
    expect(valoresDoEnum("enum('a','b','c')")).toEqual(["a", "b", "c"]);
    expect(valoresDoEnum("ENUM('um')")).toEqual(["um"]);
    expect(valoresDoEnum("int(11)")).toEqual([]);
  });
});
