/**
 * Leitura do `DATABASE_URL` para o mysql2.
 *
 * POR QUE ISTO EXISTE
 *
 * A ligação era feita entregando o endereço inteiro ao mysql2. Enquanto a base
 * de dados esteve ao lado do site, dentro da mesma plataforma, isso bastava.
 *
 * Uma base de dados alojada noutro sítio exige TLS — e é aí que o atalho parte.
 * Quem fornece o endereço escreve `?ssl-mode=REQUIRED` no fim (é o que a Aiven
 * dá, e o que o cliente oficial do MySQL entende), mas o mysql2 não conhece esse
 * parâmetro: ignora-o, liga sem cifra, e o servidor recusa com "Connections
 * using insecure transport are prohibited". A mensagem não fala de TLS nenhum, e
 * quem está a publicar o site conclui que as credenciais estão erradas.
 *
 * Aqui o endereço é lido uma vez e traduzido para aquilo que o mysql2 espera.
 */

export type DatabaseConnection = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: { rejectUnauthorized: boolean; ca?: string };
};

/** Alojamentos que servem MySQL só com TLS. Poupa uma variável a quem os usa. */
const SEMPRE_COM_TLS = [".aivencloud.com", ".planetscale.com", ".psdb.cloud", ".tidbcloud.com", ".scalingo.io"];

const pedeTls = (host: string, parametros: URLSearchParams) => {
  const modo = (parametros.get("ssl-mode") ?? parametros.get("sslmode") ?? "").toUpperCase();
  if (modo && modo !== "DISABLED" && modo !== "DISABLE") return true;
  if (parametros.get("ssl") === "true" || parametros.get("tls") === "true") return true;
  if ((process.env.DATABASE_SSL ?? "").trim() === "1") return true;
  return SEMPRE_COM_TLS.some((sufixo) => host.toLowerCase().endsWith(sufixo));
};

/**
 * Devolve a configuração de ligação, ou undefined se o endereço não der para ler
 * — e aí quem chama volta ao comportamento antigo, que é entregar o texto tal e
 * qual ao mysql2. Um endereço estranho mas que funcionava não pode deixar de
 * funcionar por causa desta leitura.
 */
export function parseDatabaseUrl(bruto: string | undefined): DatabaseConnection | undefined {
  const texto = (bruto ?? "").trim();
  if (!texto) return undefined;

  let endereco: URL;
  try {
    endereco = new URL(texto);
  } catch {
    return undefined;
  }

  if (!/^mysql2?:$/i.test(endereco.protocol)) return undefined;
  if (!endereco.hostname) return undefined;

  const base = endereco.pathname.replace(/^\//, "");
  if (!base) return undefined;

  const ligacao: DatabaseConnection = {
    host: endereco.hostname,
    port: endereco.port ? Number(endereco.port) : 3306,
    // A palavra-passe vem codificada no endereço; sem descodificar, uma que
    // tenha `@`, `#` ou `/` entra errada e o servidor responde "access denied".
    user: decodeURIComponent(endereco.username),
    password: decodeURIComponent(endereco.password),
    database: decodeURIComponent(base),
  };

  if (pedeTls(ligacao.host, endereco.searchParams)) {
    const certificado = (process.env.DATABASE_CA_CERT ?? "").trim();
    ligacao.ssl = certificado
      ? { rejectUnauthorized: true, ca: certificado.replace(/\\n/g, "\n") }
      // Sem certificado da autoridade não há como confirmar do outro lado quem
      // é — mas a ligação continua cifrada, que é o que o servidor exige. Quem
      // quiser a verificação completa cola o certificado em DATABASE_CA_CERT.
      : { rejectUnauthorized: false };
  }

  return ligacao;
}
