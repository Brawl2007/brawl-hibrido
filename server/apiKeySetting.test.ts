import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A chave da API oficial tem de poder ser definida sem a plataforma.
 *
 * Só podia vir de uma variável de ambiente — o que obriga a passar pelo
 * alojamento de cada vez. Quando esse acesso acabou, o site ficou impossível de
 * configurar: a correr, com o dono autenticado à frente dele, a dizer que
 * faltava uma chave que ele tinha na mão e não tinha por onde dar.
 *
 * A chave passa a poder ficar guardada na base de dados que o site já usa. O
 * ambiente continua a ter prioridade, para não mudar nada a quem já o usa.
 */
describe("chave da API oficial definida pelo site", () => {
  const raiz = process.cwd();
  const settings = readFileSync(resolve(raiz, "server/appSettings.ts"), "utf8");
  const api = readFileSync(resolve(raiz, "server/brawlStarsApi.ts"), "utf8");
  const routers = readFileSync(resolve(raiz, "server/routers.ts"), "utf8");
  const arranque = readFileSync(resolve(raiz, "server/arranque.ts"), "utf8");
  const draft = readFileSync(resolve(raiz, "client/src/pages/Draft.tsx"), "utf8");

  it("o ambiente continua a ter prioridade sobre a base de dados", () => {
    expect(settings).toMatch(/doAmbiente[\s\S]{0,120}return \{ key: doAmbiente, origin: "ambiente"/);
    expect(api).toMatch(/const doAmbiente = \(process\.env\.BRAWL_STARS_API_KEY \?\? ""\)\.trim\(\);[\s\S]{0,80}return doAmbiente;/);
  });

  it("a tabela é criada sozinha: a situação que isto resolve é não se poder correr comandos", () => {
    expect(settings).toContain("CREATE TABLE IF NOT EXISTS app_settings");
    expect(arranque).toContain("ensureAppSettingsTable()");
  });

  it("a chave é carregada no arranque, antes do primeiro ciclo", () => {
    expect(arranque).toMatch(/ensureAppSettingsTable\(\)[\s\S]{0,200}getStoredApiKey\(\)[\s\S]{0,200}setRuntimeApiKey/);
  });

  it("a interface nunca recebe a chave, só uma pista", () => {
    // Um segredo que a interface consegue ler é um segredo que sai pelo
    // primeiro ecrã partilhado.
    expect(routers).toContain('hint: key ? `····${key.slice(-4)}` : null');
    expect(routers).not.toMatch(/return \{[^}]*\bkey\b[^}]*\}\s*;?\s*\}\),\s*\/\*\*[\s\S]{0,200}Guarda a chave/);
  });

  it("guardar e testar são o mesmo gesto", () => {
    // Guardar uma chave errada e só descobrir daí a quinze minutos é o pior caso.
    expect(routers).toMatch(/setApiKey[\s\S]{0,600}await probeOfficialApi\(\)/);
  });

  it("só o dono pode ver o estado ou gravar", () => {
    expect(routers).toMatch(/apiKeyState[\s\S]{0,200}exigirDono\(ctx,/);
    expect(routers).toMatch(/setApiKey[\s\S]{0,300}exigirDono\(ctx,/);
  });

  it("o campo aparece no painel e esconde o que se escreve", () => {
    expect(draft).toContain("Chave da API oficial");
    expect(draft).toContain('type="password"');
    expect(draft).toContain("trpc.syncJobs.setApiKey.useMutation");
  });

  it("a mensagem de chave em falta deixou de mandar a pessoa para o ambiente", () => {
    // Mandar definir uma variável de ambiente a quem não lhe consegue chegar
    // é exatamente o beco em que isto nasceu.
    expect(api).toContain("Cola-a no campo abaixo");
  });
});
