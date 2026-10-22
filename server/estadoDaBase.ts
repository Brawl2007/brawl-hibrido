import { sql, type SQL } from "drizzle-orm";

/** Só o nome público do fornecedor; nunca devolve o endereço ou credenciais. */
export function fornecedorDaBase(endereco: string | undefined) {
  try {
    const host = new URL(endereco ?? "").hostname.toLowerCase();
    if (host.endsWith(".aivencloud.com")) return "aiven";
    if (host.endsWith(".tidbcloud.com")) return "tidb";
    if (host.endsWith(".psdb.cloud") || host.endsWith(".planetscale.com")) return "planetscale";
    return "outro";
  } catch {
    return "desconhecido";
  }
}

/** Diagnóstico só de leitura: não muda variáveis nem faz escritas de teste. */
export async function consultarModoDeLeitura(executar: (consulta: SQL) => PromiseLike<unknown>): Promise<boolean | null> {
  try {
    const resultado = await executar(sql`SHOW GLOBAL VARIABLES WHERE Variable_name IN ('read_only', 'super_read_only')`);
    const linhas = Array.isArray(resultado) && Array.isArray(resultado[0]) ? resultado[0] : [];
    let conhecido = false;
    for (const linha of linhas) {
      if (!linha || typeof linha !== "object") continue;
      const nome = String(linha.Variable_name ?? linha.variable_name ?? "").toLowerCase();
      if (nome !== "read_only" && nome !== "super_read_only") continue;
      const valor = String(linha.Value ?? linha.value ?? "").toUpperCase();
      if (valor === "ON" || valor === "1") return true;
      if (valor === "OFF" || valor === "0") conhecido = true;
    }
    return conhecido ? false : null;
  } catch {
    // Um fornecedor pode negar SHOW sem impedir a leitura das partidas.
    return null;
  }
}

/** Estimativas do catálogo MySQL: não lê partidas nem valores de definições. */
export async function consultarEspacoDasTabelas(executar: (consulta: SQL) => PromiseLike<unknown>) {
  try {
    const resultado = await executar(sql`
      SELECT TABLE_NAME AS tabela, DATA_LENGTH AS dados, INDEX_LENGTH AS indices,
             DATA_FREE AS livre, TABLE_ROWS AS linhas
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY DATA_LENGTH + INDEX_LENGTH DESC
      LIMIT 50
    `);
    const linhas = Array.isArray(resultado) && Array.isArray(resultado[0]) ? resultado[0] : [];
    const numero = (valor: unknown) => Number.isFinite(Number(valor)) ? Math.max(0, Number(valor)) : 0;
    return linhas.filter((linha) => linha && typeof linha.tabela === "string" && /^[a-zA-Z0-9_]+$/.test(linha.tabela))
      .map((linha) => ({ tabela: linha.tabela as string, dados: numero(linha.dados), indices: numero(linha.indices),
        livre: numero(linha.livre), linhas: numero(linha.linhas) }));
  } catch {
    return null;
  }
}
