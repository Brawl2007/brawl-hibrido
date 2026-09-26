/**
 * Criação das tabelas no arranque.
 *
 * POR QUE ISTO EXISTE
 *
 * As tabelas eram criadas por `pnpm db:push`, um comando de terminal. Isso
 * pressupõe que quem publica o site tem terminal — e nos alojamentos gratuitos
 * não tem: há um painel com botões e mais nada. Sem esse comando, o site sobe,
 * abre, e depois falha em tudo o que precise de guardar seja o que for, com
 * `Failed query: select ... from ranked_sync_config`.
 *
 * O ficheiro `drizzle/criar-tabelas.sql` já era seguro de correr as vezes que
 * fossem: só tem `CREATE TABLE IF NOT EXISTS`, nunca altera nem apaga. Sendo
 * assim, não há motivo para exigir uma pessoa a correr à mão uma coisa que o
 * arranque pode fazer sozinho — e é o mesmo que `app_settings` já fazia.
 *
 * Nada aqui é fatal: uma base de dados inacessível deixa o site a servir o
 * catálogo do repositório, que é o comportamento que já existia.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

let jaCorreu = false;

/** Só para os testes. */
export function resetEnsureTablesForTests() {
  jaCorreu = false;
}

/**
 * As instruções do instalador, uma a uma.
 *
 * Corta pelos `;` no fim de linha — o mesmo critério de `scripts/db-setup.mjs`,
 * para os dois lerem o ficheiro da mesma maneira.
 */
export function separarInstrucoes(conteudo: string): string[] {
  return conteudo
    .split(/;\s*(?:\r?\n|$)/)
    .map((bloco) => bloco.replace(/^\s*--.*$/gm, "").trim())
    .filter((bloco) => bloco.length > 0);
}

/**
 * Só instruções de criação passam.
 *
 * O ficheiro é de confiança, mas este arranque corre sem ninguém a ver e contra
 * a base de dados verdadeira. Um `ALTER` ou um `DROP` que ali aparecesse um dia
 * por engano não vai ser executado às escondidas por causa de um reinício.
 */
export function apenasCriacoes(instrucoes: readonly string[]) {
  return instrucoes.filter((instrucao) => /^CREATE TABLE IF NOT EXISTS/i.test(instrucao));
}

function lerInstalador(): string | undefined {
  const candidatos = [
    resolve(process.cwd(), "drizzle/criar-tabelas.sql"),
    resolve(process.cwd(), "../drizzle/criar-tabelas.sql"),
  ];
  for (const caminho of candidatos) {
    try {
      return readFileSync(caminho, "utf-8");
    } catch {
      // Tenta o caminho seguinte.
    }
  }
  return undefined;
}

/**
 * REPAROS DE COLUNAS JÁ CRIADAS
 *
 * O `CREATE TABLE IF NOT EXISTS` não toca numa tabela que já exista — é essa a
 * sua virtude e, aqui, a sua limitação.
 *
 * O caso que obrigou a isto: a coluna `source` de `counter_sync_relation_evidence`
 * foi criada com três valores possíveis, e o código escreve quatro. O quarto é o
 * `prodigy` — precisamente a fonte com mais dados de todas, 1632 relações. Cada
 * gravação dessas falhava, e falhava no fim de uma recolha bem sucedida: o
 * painel mostrava a fonte a verde e a base de dados ficava sem as provas.
 *
 * Um reparo destes só ALARGA o que a coluna aceita. Nunca tira um valor, nunca
 * muda o tipo, nunca mexe numa linha. Correr duas vezes não faz nada à segunda,
 * porque a primeira coisa que faz é ver se já está bem.
 */
type ReparoDeEnum = { tabela: string; coluna: string; valores: readonly string[]; obrigatoria: boolean };

export const REPAROS_DE_ENUM: readonly ReparoDeEnum[] = [
  {
    tabela: "counter_sync_relation_evidence",
    coluna: "source",
    valores: ["brawlscope", "calculator", "planet", "prodigy"],
    obrigatoria: true,
  },
];

/** Os valores que uma definição `enum('a','b')` do MySQL declara. */
export function valoresDoEnum(definicao: string): string[] {
  const dentro = /^enum\((.*)\)$/i.exec(definicao.trim())?.[1];
  if (!dentro) return [];
  return Array.from(dentro.matchAll(/'((?:[^']|'')*)'/g)).map((par) => par[1].replace(/''/g, "'"));
}

/**
 * A instrução que alarga a coluna — ou undefined se não for precisa.
 *
 * O conjunto final é a união do que lá está com o que falta: um valor que exista
 * na base e já não conste do código continua a ser aceite. Apagá-lo seria
 * arriscar linhas antigas por uma arrumação que ninguém pediu.
 */
export function instrucaoDeAlargamento(reparo: ReparoDeEnum, definicaoAtual: string): string | undefined {
  const atuais = valoresDoEnum(definicaoAtual);
  if (atuais.length === 0) return undefined;
  const emFalta = reparo.valores.filter((valor) => !atuais.includes(valor));
  if (emFalta.length === 0) return undefined;

  const finais = [...atuais, ...emFalta].map((valor) => `'${valor.replace(/'/g, "''")}'`).join(",");
  const nulidade = reparo.obrigatoria ? " NOT NULL" : "";
  return `ALTER TABLE \`${reparo.tabela}\` MODIFY COLUMN \`${reparo.coluna}\` enum(${finais})${nulidade}`;
}

async function repararEnums(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  for (const reparo of REPAROS_DE_ENUM) {
    try {
      const resultado = await db.execute(sql`
        SELECT COLUMN_TYPE AS definicao
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${reparo.tabela} AND COLUMN_NAME = ${reparo.coluna}
        LIMIT 1
      `);
      const rows: unknown = Array.isArray(resultado) ? resultado[0] : resultado;
      const linhas = (Array.isArray(rows) ? rows : []) as Array<{ definicao?: string }>;
      const definicao = linhas?.[0]?.definicao;
      if (!definicao) continue;

      const instrucao = instrucaoDeAlargamento(reparo, definicao);
      if (!instrucao) continue;

      await db.execute(sql.raw(instrucao));
      console.log(`[Tabelas] Coluna ${reparo.tabela}.${reparo.coluna} alargada para aceitar ${reparo.valores.join(", ")}.`);
    } catch (error) {
      console.warn(`[Tabelas] Não foi possível reparar ${reparo.tabela}.${reparo.coluna}:`, error instanceof Error ? error.message : error);
    }
  }
}

/** O nome da tabela de uma instrução `CREATE TABLE IF NOT EXISTS \`nome\``. */
export function nomeDaTabela(instrucao: string): string | undefined {
  return /^CREATE TABLE IF NOT EXISTS\s+`?([A-Za-z0-9_]+)`?/i.exec(instrucao)?.[1];
}

/**
 * Só as criações das tabelas que ainda não existem.
 *
 * Cada instância da Vercel que acorda corria as 16 criações, uma a uma, antes
 * de responder ao primeiro pedido — 16 idas à base de dados para, quase sempre,
 * não criar nada. Agora pergunta-se uma vez que tabelas há e só se cria o que
 * falta. Uma instrução cujo nome não se consiga ler corre sempre: na dúvida,
 * cria-se, como antes.
 */
export function instrucoesEmFalta(instrucoes: readonly string[], existentes: ReadonlySet<string>) {
  return instrucoes.filter((instrucao) => {
    const nome = nomeDaTabela(instrucao);
    return !nome || !existentes.has(nome.toLowerCase());
  });
}

/** As tabelas que a base já tem, em minúsculas — ou undefined se não der para perguntar. */
async function tabelasExistentes(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<Set<string> | undefined> {
  try {
    const resultado = await db.execute(sql`SELECT TABLE_NAME AS nome FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`);
    const rows: unknown = Array.isArray(resultado) ? resultado[0] : resultado;
    const linhas = (Array.isArray(rows) ? rows : []) as Array<{ nome?: string; TABLE_NAME?: string }>;
    return new Set(linhas.map((linha) => String(linha.nome ?? linha.TABLE_NAME ?? "").toLowerCase()).filter(Boolean));
  } catch {
    // Sem resposta, corre tudo: o IF NOT EXISTS garante que não estraga nada.
    return undefined;
  }
}

export async function ensureTables(): Promise<{ criadas: number; total: number } | undefined> {
  if (jaCorreu) return undefined;
  jaCorreu = true;

  const db = await getDb();
  if (!db) return undefined;

  const conteudo = lerInstalador();
  if (!conteudo) {
    console.warn("[Tabelas] Não encontrei drizzle/criar-tabelas.sql. Se as tabelas faltarem, corre `pnpm db:push`.");
    return undefined;
  }

  const instrucoes = apenasCriacoes(separarInstrucoes(conteudo));
  const existentes = await tabelasExistentes(db);
  const aCorrer = existentes ? instrucoesEmFalta(instrucoes, existentes) : instrucoes;
  let criadas = 0;
  for (const instrucao of aCorrer) {
    try {
      await db.execute(sql.raw(instrucao));
      criadas += 1;
    } catch (error) {
      // Uma tabela que já exista não chega aqui (o IF NOT EXISTS trata disso);
      // o que chega é um problema real de permissões ou de sintaxe, e vale mais
      // registá-lo e continuar do que impedir o site de arrancar.
      console.warn("[Tabelas] Instrução falhou:", error instanceof Error ? error.message : error);
    }
  }

  await repararEnums(db);

  if (aCorrer.length > 0) console.log(`[Tabelas] Instalador corrido: ${criadas} de ${aCorrer.length} instruções sem erro.`);
  return { criadas, total: aCorrer.length };
}
