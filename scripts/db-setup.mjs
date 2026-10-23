#!/usr/bin/env node
/**
 * Instalador da base de dados — cria só o que falta.
 *
 * POR QUE NÃO SE USA O DRIZZLE-KIT AQUI
 *
 * Duas tentativas falharam, cada uma por sua razão:
 *
 *  1. `drizzle-kit migrate` — o histórico estava irrecuperável: três migrações
 *     iniciais diferentes, o diário a apontar para um ficheiro que não existia,
 *     e sem as fotografias que permitem comparar estados. Falhou sem criar nada.
 *
 *  2. `drizzle-kit push` — falhou com `ER_MULTIPLE_PRI_KEY` ao tentar
 *     `ALTER TABLE counter_relations ADD PRIMARY KEY(id)`. Esse erro é uma
 *     informação valiosa: só acontece quando a tabela JÁ EXISTE e JÁ TEM chave
 *     primária. A base de dados não está vazia — tem tabelas de uma instalação
 *     anterior, e o push queria reescrevê-las.
 *
 * Perante uma base de dados meio construída e com dados lá dentro, a ferramenta
 * certa não é a que reescreve: é a que acrescenta. Este instalador nunca altera
 * nem apaga nada. Lê o que existe, cria o que falta, e diz o que fez.
 *
 * Correr duas vezes não faz diferença nenhuma.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");

const TABELAS_ESPERADAS = [
  "users",
  "ranked_sync_config",
  "ranked_sync_runs",
  "ranked_sync_snapshots",
  "prodigy_links",
  "counter_relations",
  "counter_sync_config",
  "counter_sync_runs",
  "counter_sync_snapshots",
  "counter_sync_relation_evidence",
  "observed_battles",
  "observed_battle_quality",
  "observed_match_collection_config",
  "observed_match_collection_runs",
  "observed_matchup_aggregates",
];

function separarInstrucoes(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((bloco) => bloco.replace(/^\s*--.*$/gm, "").trim())
    .filter((bloco) => bloco.length > 0);
}

/** Nome da tabela que uma instrução CREATE cria. */
function tabelaDe(instrucao) {
  const match = instrucao.match(/CREATE TABLE (?:IF NOT EXISTS )?`?([a-z_]+)`?/i);
  return match?.[1];
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("[db-setup] DATABASE_URL não está definida. Sem ela não há base de dados para preparar.");
    process.exit(1);
  }

  let mysql;
  try {
    mysql = await import("mysql2/promise");
  } catch {
    console.error("[db-setup] O pacote mysql2 não está instalado. Corre `pnpm install` primeiro.");
    process.exit(1);
  }

  // `multipleStatements` fica desligado de propósito: cada instrução é enviada
  // à parte, para um erro poder ser atribuído à tabela certa.
  const ligacao = await mysql.createConnection(url);

  try {
    const [linhas] = await ligacao.query(
      "SELECT TABLE_NAME AS nome FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
    );
    const existentes = new Set(linhas.map((linha) => String(linha.nome)));

    console.log(`[db-setup] Base de dados ligada. Tabelas já existentes: ${existentes.size}`);

    const emFalta = TABELAS_ESPERADAS.filter((nome) => !existentes.has(nome));
    if (emFalta.length === 0) {
      console.log("[db-setup] Nada a fazer: as 14 tabelas já existem.");
      return;
    }

    console.log(`[db-setup] Em falta (${emFalta.length}): ${emFalta.join(", ")}`);

    const sql = readFileSync(resolve(raiz, "drizzle/criar-tabelas.sql"), "utf8");
    const instrucoes = separarInstrucoes(sql).filter((bloco) => /^CREATE TABLE/i.test(bloco));

    let criadas = 0;
    const falhadas = [];
    for (const instrucao of instrucoes) {
      const tabela = tabelaDe(instrucao);
      if (!tabela || existentes.has(tabela)) continue;
      try {
        await ligacao.query(instrucao);
        criadas += 1;
        console.log(`[db-setup]   criada: ${tabela}`);
      } catch (erro) {
        // Uma tabela que falhe não pode impedir as outras de serem criadas.
        falhadas.push({ tabela, motivo: erro?.message ?? String(erro) });
        console.error(`[db-setup]   FALHOU: ${tabela} — ${erro?.message ?? erro}`);
      }
    }

    const [depois] = await ligacao.query(
      "SELECT TABLE_NAME AS nome FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
    );
    const agora = new Set(depois.map((linha) => String(linha.nome)));
    const aindaEmFalta = TABELAS_ESPERADAS.filter((nome) => !agora.has(nome));

    /**
     * Reparação de colunas em falta.
     *
     * O instalador nunca altera tabelas existentes — mas tabelas criadas por
     * versões antigas do site podem não ter colunas que o código atual exige
     * (foi assim que o login do dono passou a falhar: `users` sem a coluna
     * `role`, e o insert rebentava com "Unknown column"). Aqui acrescenta-se
     * só o que falta; nada é alterado nem apagado.
     */
    const [colunasUsers] = await ligacao.query(
      "SELECT COLUMN_NAME AS nome FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'",
    );
    const nomesColunas = new Set(colunasUsers.map((c) => String(c.nome)));
    const reparacoes = [
      { coluna: "role", sql: "ALTER TABLE `users` ADD COLUMN `role` enum('user','admin') NOT NULL DEFAULT 'user'" },
      { coluna: "loginMethod", sql: "ALTER TABLE `users` ADD COLUMN `loginMethod` varchar(64)" },
    ];
    for (const { coluna, sql } of reparacoes) {
      if (nomesColunas.has(coluna)) continue;
      try {
        await ligacao.query(sql);
        console.log(`[db-setup] users: coluna acrescentada — ${coluna}`);
      } catch (erro) {
        console.error(`[db-setup] users: NÃO FOI POSSÍVEL acrescentar ${coluna} — ${erro?.message ?? erro}`);
      }
    }

    console.log(`\n[db-setup] Criadas ${criadas} tabelas.`);
    if (aindaEmFalta.length) {
      console.error(`[db-setup] Continuam em falta: ${aindaEmFalta.join(", ")}`);
      for (const { tabela, motivo } of falhadas) console.error(`[db-setup]   ${tabela}: ${motivo}`);
      process.exit(1);
    }
    console.log("[db-setup] As 14 tabelas estão criadas. Nenhuma tabela existente foi alterada.");
  } finally {
    await ligacao.end();
  }
}

main().catch((erro) => {
  console.error("[db-setup] Falhou:", erro?.message ?? erro);
  process.exit(1);
});
