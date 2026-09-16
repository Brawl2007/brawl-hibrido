import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * O histórico de migrações estava irrecuperável, e era isso que impedia a base
 * de dados de ser criada.
 *
 * `drizzle-kit migrate` falhava com exit code 1 sem criar tabela nenhuma. A
 * causa estava na pasta `drizzle/`:
 *
 *  - TRÊS migrações iniciais diferentes (`0000_gigantic_ted_forrester`,
 *    `0000_overconfident_shinobi_shaw`, `0000_warm_mojo`), cada uma de uma
 *    reinicialização diferente do projeto, todas a dizer "cria tudo do zero";
 *  - o diário apontava para um quarto nome, `0000_typical_avengers`, que não
 *    existia na pasta;
 *  - e faltavam as fotografias (`meta/*_snapshot.json`), sem as quais cada
 *    `generate` produz outra migração que tenta criar tudo de novo.
 *
 * Não havia sequência de ficheiros que descrevesse o caminho até ao esquema
 * atual. A correção foi deixar de usar migrações: `drizzle-kit push` compara o
 * esquema em código diretamente com a base de dados e aplica a diferença.
 */
describe("criação da base de dados", () => {
  const raiz = process.cwd();
  const pkg = JSON.parse(readFileSync(resolve(raiz, "package.json"), "utf8"));

  it("db:push usa o instalador que só acrescenta, não o drizzle-kit", () => {
    expect(pkg.scripts["db:push"]).toBe("node scripts/db-setup.mjs");
    // As duas ferramentas que falharam não podem voltar a ser o caminho por omissão:
    // `migrate` por causa do histórico partido, `push` porque tenta ALTERar tabelas
    // que já existem (ER_MULTIPLE_PRI_KEY em counter_relations).
    expect(pkg.scripts["db:push"]).not.toContain("drizzle-kit");
  });

  it("não sobram migrações soltas na pasta que o drizzle lê", () => {
    // `criar-tabelas.sql` é o instalador, não uma migração: o drizzle-kit não o lê.
    const soltos = readdirSync(resolve(raiz, "drizzle"))
      .filter((nome) => nome.endsWith(".sql") && nome !== "criar-tabelas.sql");
    expect(soltos).toEqual([]);
  });

  it("não existe mais do que uma migração inicial", () => {
    const historico = resolve(raiz, "drizzle/historico-migracoes");
    const iniciais = existsSync(historico)
      ? readdirSync(historico).filter((nome) => nome.startsWith("0000_"))
      : [];
    // Ficam guardadas como leitura, mas fora do caminho do drizzle.
    expect(iniciais.length).toBeGreaterThan(1);
    expect(readdirSync(resolve(raiz, "drizzle")).filter((n) => n.startsWith("0000_"))).toEqual([]);
  });

  it("o diário não aponta para ficheiros que não existem", () => {
    const diario = JSON.parse(readFileSync(resolve(raiz, "drizzle/meta/_journal.json"), "utf8"));
    const ficheiros = new Set(readdirSync(resolve(raiz, "drizzle")));
    for (const entrada of diario.entries ?? []) {
      expect(ficheiros.has(`${entrada.tag}.sql`)).toBe(true);
    }
  });

  it("o esquema continua a declarar as tabelas todas", () => {
    const schema = readFileSync(resolve(raiz, "drizzle/schema.ts"), "utf8");
    const tabelas = schema.match(/mysqlTable\(/g) ?? [];
    expect(tabelas.length).toBeGreaterThanOrEqual(15);
  });

  it("a razão da mudança fica escrita onde quem tropeçar a encontra", () => {
    const leiaMe = readFileSync(resolve(raiz, "drizzle/historico-migracoes/LEIA-ME.md"), "utf8");
    expect(leiaMe).toContain("três migrações iniciais diferentes");
    expect(leiaMe).toContain("0000_typical_avengers");
  });
});

/**
 * O instalador da base de dados.
 *
 * A segunda tentativa — `drizzle-kit push` — falhou com `ER_MULTIPLE_PRI_KEY`
 * ao tentar `ALTER TABLE counter_relations ADD PRIMARY KEY(id)`. Esse erro só
 * acontece quando a tabela JÁ EXISTE e JÁ TEM chave primária: a base de dados
 * não estava vazia, tinha tabelas de uma instalação anterior, e o push queria
 * reescrevê-las.
 *
 * Perante uma base de dados meio construída e com dados lá dentro, a ferramenta
 * certa não é a que reescreve — é a que acrescenta.
 */
describe("instalador da base de dados", () => {
  const raiz = process.cwd();
  const script = readFileSync(resolve(raiz, "scripts/db-setup.mjs"), "utf8");
  const sql = readFileSync(resolve(raiz, "drizzle/criar-tabelas.sql"), "utf8");

  it("cria as 15 tabelas e nenhuma a mais", () => {
    const tabelas = sql.match(/CREATE TABLE IF NOT EXISTS `[a-z_]+`/g) ?? [];
    expect(tabelas).toHaveLength(15);
  });

  it("nunca altera nem apaga o que já existe", () => {
    // Os comentários do cabeçalho citam o erro do drizzle, que fala em ALTER
    // TABLE. O que conta é o SQL executável, por isso os comentários saem antes.
    const executavel = sql.replace(/^\s*--.*$/gm, "");
    expect(executavel).not.toMatch(/\bALTER TABLE\b/i);
    expect(executavel).not.toMatch(/\bDROP\b/i);
    expect(executavel).not.toMatch(/\bTRUNCATE\b/i);
    expect(script).not.toMatch(/query\([^)]*\b(DROP|TRUNCATE)\b/i);
  });

  it("cada CREATE é protegido por IF NOT EXISTS", () => {
    const criacoes = sql.match(/CREATE TABLE[^`]*`/g) ?? [];
    for (const criacao of criacoes) expect(criacao).toContain("IF NOT EXISTS");
  });

  it("pergunta à base de dados o que existe antes de criar seja o que for", () => {
    expect(script).toContain("information_schema.TABLES");
    expect(script).toMatch(/emFalta/);
  });

  it("uma tabela que falhe não impede as outras de serem criadas", () => {
    expect(script).toMatch(/catch \(erro\)[\s\S]{0,200}falhadas\.push/);
  });

  it("termina com erro quando alguma tabela continua em falta", () => {
    // Sair com sucesso deixando tabelas por criar seria o pior dos mundos:
    // o site arrancava e só falhava mais tarde, sem ninguém ligar as duas coisas.
    expect(script).toMatch(/aindaEmFalta\.length[\s\S]{0,300}process\.exit\(1\)/);
  });

  it("corre sem perguntas: é executado por um agente, não por uma pessoa", () => {
    expect(script).not.toMatch(/readline|prompt\(|question\(/);
  });
});
