/**
 * Definições guardadas na base de dados.
 *
 * POR QUE ISTO EXISTE
 *
 * A chave da API oficial só podia vir de uma variável de ambiente. Isso obriga
 * a passar pela plataforma de alojamento de cada vez — e quando o acesso a essa
 * plataforma acaba, o site fica sem forma nenhuma de ser configurado, mesmo
 * estando a correr e com o dono à frente dele.
 *
 * Foi exatamente o que aconteceu: a chave existia, era válida, o teste direto
 * passava, e o site continuava a dizer "falta definir BRAWL_STARS_API_KEY"
 * porque o processo nunca a recebeu. Sem créditos para mexer no ambiente, não
 * havia saída.
 *
 * Agora há: o dono cola a chave no próprio site e ela fica guardada na base de
 * dados que o site já usa. A variável de ambiente continua a ter prioridade —
 * quem já a tem configurada não muda nada.
 *
 * A tabela é criada no arranque, se faltar. Não depende de migrações nem de
 * comandos externos, precisamente porque a situação que isto resolve é a de não
 * se poder correr comandos.
 */

import { sql } from "drizzle-orm";
import { getDb } from "./db";

const cache = new Map<string, string | null>();
let tabelaPronta = false;

/** Cria a tabela se faltar. Silenciosa: o site funciona sem ela. */
export async function ensureAppSettingsTable() {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key varchar(64) NOT NULL,
        setting_value text,
        updated_at timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (setting_key)
      )
    `);
    tabelaPronta = true;
    return true;
  } catch (error) {
    console.warn("[Definições] Não foi possível preparar a tabela app_settings:", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Lê uma definição, com cache. Devolve null quando não existe. */
export async function getSetting(chave: string): Promise<string | null> {
  if (cache.has(chave)) return cache.get(chave) ?? null;
  const db = await getDb();
  if (!db) return null;
  try {
    if (!tabelaPronta) await ensureAppSettingsTable();
    const resultado = await db.execute(sql`SELECT setting_value FROM app_settings WHERE setting_key = ${chave} LIMIT 1`);
    const rows: unknown = Array.isArray(resultado) ? resultado[0] : resultado;
    const linhas = (Array.isArray(rows) ? rows : []) as Array<{ setting_value?: string | null }>;
    const valor = linhas?.[0]?.setting_value ?? null;
    cache.set(chave, valor);
    return valor;
  } catch {
    // Uma definição ilegível não pode impedir o site de servir.
    cache.set(chave, null);
    return null;
  }
}

/** Grava uma definição. Passar null apaga-a. */
export async function setSetting(chave: string, valor: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Base de dados indisponível: a definição não pode ser guardada.");
  if (!tabelaPronta) {
    const pronta = await ensureAppSettingsTable();
    if (!pronta) throw new Error("Não foi possível preparar a tabela de definições.");
  }

  if (valor === null) {
    await db.execute(sql`DELETE FROM app_settings WHERE setting_key = ${chave}`);
  } else {
    await db.execute(sql`
      INSERT INTO app_settings (setting_key, setting_value) VALUES (${chave}, ${valor})
      ON DUPLICATE KEY UPDATE setting_value = ${valor}
    `);
  }
  cache.set(chave, valor);
  return valor;
}

/** Esquece a cache; a próxima leitura volta à base de dados. */
export function forgetSettingsCache() {
  cache.clear();
}

export const BRAWL_STARS_API_KEY_SETTING = "brawlStarsApiKey";

/**
 * A chave da API oficial, venha de onde vier.
 *
 * O ambiente tem prioridade: quem já a configurou lá não vê diferença nenhuma.
 * A base de dados é a alternativa para quem não consegue lá chegar.
 */
export async function getStoredApiKey() {
  const doAmbiente = (process.env.BRAWL_STARS_API_KEY ?? "").trim();
  if (doAmbiente) return { key: doAmbiente, origin: "ambiente" as const };
  const daBase = (await getSetting(BRAWL_STARS_API_KEY_SETTING))?.trim();
  if (daBase) return { key: daBase, origin: "site" as const };
  return { key: "", origin: "nenhuma" as const };
}
