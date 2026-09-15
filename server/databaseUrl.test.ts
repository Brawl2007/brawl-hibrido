import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseDatabaseUrl } from "./databaseUrl";

/**
 * A tradução do DATABASE_URL. Ver o cabeçalho de `databaseUrl.ts` para o porquê:
 * o erro que isto evita não fala de TLS e manda quem publica o site à procura
 * das credenciais erradas.
 */
const guardado = { ssl: process.env.DATABASE_SSL, ca: process.env.DATABASE_CA_CERT };

beforeEach(() => {
  delete process.env.DATABASE_SSL;
  delete process.env.DATABASE_CA_CERT;
});

afterEach(() => {
  if (guardado.ssl === undefined) delete process.env.DATABASE_SSL; else process.env.DATABASE_SSL = guardado.ssl;
  if (guardado.ca === undefined) delete process.env.DATABASE_CA_CERT; else process.env.DATABASE_CA_CERT = guardado.ca;
});

describe("leitura do DATABASE_URL", () => {
  it("separa as partes de um endereço normal e não pede TLS", () => {
    const ligacao = parseDatabaseUrl("mysql://raiz:abc123@db.interno:3307/brawl");
    expect(ligacao).toMatchObject({ host: "db.interno", port: 3307, user: "raiz", password: "abc123", database: "brawl" });
    expect(ligacao?.ssl).toBeUndefined();
  });

  it("assume a porta 3306 quando o endereço não a diz", () => {
    expect(parseDatabaseUrl("mysql://raiz:abc123@db.interno/brawl")?.port).toBe(3306);
  });

  it("descodifica uma palavra-passe com símbolos — era isto que dava 'access denied'", () => {
    const ligacao = parseDatabaseUrl("mysql://raiz:p%40ss%2Fw%23rd@db.interno/brawl");
    expect(ligacao?.password).toBe("p@ss/w#rd");
  });

  it("liga com TLS quando o endereço traz ssl-mode=REQUIRED", () => {
    const ligacao = parseDatabaseUrl("mysql://raiz:abc@db.interno/brawl?ssl-mode=REQUIRED");
    expect(ligacao?.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("liga com TLS num alojamento que só serve com TLS, mesmo sem parâmetro nenhum", () => {
    const ligacao = parseDatabaseUrl("mysql://avnadmin:abc@brawl-db.h.aivencloud.com:12345/defaultdb");
    expect(ligacao?.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("verifica o certificado quando lhe dão a autoridade", () => {
    process.env.DATABASE_CA_CERT = "-----BEGIN CERTIFICATE-----\\nMII\\n-----END CERTIFICATE-----";
    const ligacao = parseDatabaseUrl("mysql://raiz:abc@db.interno/brawl?ssl-mode=REQUIRED");
    expect(ligacao?.ssl?.rejectUnauthorized).toBe(true);
    // As variáveis de ambiente costumam chegar com o \n escrito à letra.
    expect(ligacao?.ssl?.ca).toContain("\n");
    expect(ligacao?.ssl?.ca).not.toContain("\\n");
  });

  it("DATABASE_SSL=1 chega para exigir TLS", () => {
    process.env.DATABASE_SSL = "1";
    expect(parseDatabaseUrl("mysql://raiz:abc@db.interno/brawl")?.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("ssl-mode=DISABLED não liga TLS", () => {
    expect(parseDatabaseUrl("mysql://raiz:abc@db.interno/brawl?ssl-mode=DISABLED")?.ssl).toBeUndefined();
  });

  it("devolve nada para o que não souber ler, para o comportamento antigo continuar a valer", () => {
    expect(parseDatabaseUrl(undefined)).toBeUndefined();
    expect(parseDatabaseUrl("")).toBeUndefined();
    expect(parseDatabaseUrl("nada disto é um endereço")).toBeUndefined();
    expect(parseDatabaseUrl("postgres://raiz:abc@db.interno/brawl")).toBeUndefined();
    // Sem nome de base de dados não há ligação possível: melhor deixar passar
    // para o mysql2 do que inventar uma.
    expect(parseDatabaseUrl("mysql://raiz:abc@db.interno")).toBeUndefined();
  });
});
