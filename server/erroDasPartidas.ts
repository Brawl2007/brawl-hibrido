/** Diagnóstico público: nunca inclui SQL, parâmetros, endereços ou credenciais. */
export function diagnosticoDasPartidas(erro: unknown) {
  const vistos = new Set<unknown>();
  let atual: unknown = erro;
  for (let nivel = 0; nivel < 8 && atual && !vistos.has(atual); nivel++) {
    vistos.add(atual);
    if (typeof atual !== "object") break;
    const detalhe = atual as { code?: unknown; errno?: unknown; cause?: unknown };
    const codigo = typeof detalhe.code === "string" ? detalhe.code : "";
    const numero = detalhe.errno;
    if (["ER_DISK_FULL", "ER_RECORD_FILE_FULL"].includes(codigo) || numero === 1021 || numero === 1114) {
      return { errorCode: "DATABASE_STORAGE_FULL", error: "A base de dados atingiu o limite de armazenamento. A recolha está bloqueada; verifica o espaço no alojamento, preservando as partidas guardadas." };
    }
    if (["ER_OPTION_PREVENTS_STATEMENT", "ER_READ_ONLY_MODE", "ER_INNODB_READ_ONLY"].includes(codigo) || numero === 1290 || numero === 1836) {
      return { errorCode: "DATABASE_WRITE_BLOCKED", error: "O servidor da base de dados bloqueou a escrita. Verifica o modo de leitura e os limites do alojamento; os dados existentes devem ser preservados." };
    }
    if (["ER_ACCESS_DENIED_ERROR", "ER_DBACCESS_DENIED_ERROR", "ER_TABLEACCESS_DENIED_ERROR"].includes(codigo) || numero === 1045 || numero === 1044 || numero === 1142) {
      return { errorCode: "DATABASE_PERMISSION_DENIED", error: "A base de dados recusou o acesso. Verifica as credenciais e as permissões de leitura e escrita no alojamento." };
    }
    if (codigo === "ER_NO_SUCH_TABLE" || numero === 1146) {
      return { errorCode: "DATABASE_TABLE_MISSING", error: "Falta uma tabela necessária às partidas. Verifica o instalador da base de dados sem apagar tabelas existentes." };
    }
    if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "PROTOCOL_CONNECTION_LOST", "ER_CON_COUNT_ERROR"].includes(codigo)) {
      return { errorCode: "DATABASE_UNAVAILABLE", error: "Não foi possível comunicar com a base de dados. Verifica a ligação e a disponibilidade do alojamento." };
    }
    atual = detalhe.cause;
  }
  return { errorCode: "PARTIDAS_UNAVAILABLE", error: "Não foi possível ler ou guardar as partidas. Os dados estão indisponíveis; isto não significa que existam zero partidas." };
}

/** Uma leitura falhada nunca se transforma numa amostra vazia. */
export async function lerPartidasSemOcultarErro<T>(ler: () => PromiseLike<T>): Promise<T> {
  try {
    return await ler();
  } catch (erro) {
    const diagnostico = diagnosticoDasPartidas(erro);
    console.error("[Partidas] Leitura falhou:", diagnostico.errorCode);
    throw new Error(diagnostico.error);
  }
}
