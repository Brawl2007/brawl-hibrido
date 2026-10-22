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
