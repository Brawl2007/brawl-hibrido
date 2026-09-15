import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * O site não pode ficar sem dono nenhum.
 *
 * O perfil de dono vinha só de `OWNER_OPEN_ID`. Se essa variável não estivesse
 * definida — ou tivesse o valor errado — NINGUÉM era admin, e o botão de
 * atualizar respondia "Apenas o proprietário pode forçar uma atualização" para
 * sempre. A mensagem era verdadeira e completamente inútil: não dizia quem é o
 * dono nem como se passa a ser. Uma porta trancada com a chave lá dentro.
 */
describe("quem é o dono do site", () => {
  const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
  const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

  it("reconhece o dono por identificador e também por email", () => {
    expect(db).toContain("ENV.ownerOpenId");
    // O email é o que uma pessoa sabe de cor; o openId tem de se ir descobrir.
    expect(db).toContain("OWNER_EMAIL");
  });

  it("sem dono configurado, a primeira sessão reclama o site", () => {
    expect(db).toContain("shouldBeOwner");
    // A via de arranque fecha-se assim que existir um admin.
    expect(db).toMatch(/jaHaAdmin[\s\S]{0,60}return false/);
  });

  it("a via de arranque não se abre quando já há dono configurado", () => {
    // Com OWNER_OPEN_ID ou OWNER_EMAIL definidos, ninguém reclama nada.
    expect(db).toMatch(/if \(ownerOpenId \|\| ownerEmail\) return false;/);
  });

  it("a recusa diz o que fazer, não só que não pode", () => {
    expect(routers).toContain("exigirDono");
    expect(routers).toContain("OWNER_OPEN_ID=${ctx.user.openId}");
    // A mensagem antiga, sem saída, não pode voltar a ser usada como resposta.
    // (Mencioná-la num comentário é legítimo; devolvê-la ao utilizador não.)
    expect(routers).not.toMatch(/message:\s*"Apenas o propriet/);
  });

  it("as três ações protegidas usam a mesma verificação", () => {
    const ocorrencias = routers.match(/exigirDono\(ctx,/g) ?? [];
    expect(ocorrencias.length).toBeGreaterThanOrEqual(3);
    expect(routers).not.toMatch(/ctx\.user\.role !== "admin"/);
  });

  it("o painel mostra o perfil da sessão antes de o botão falhar", () => {
    const draftSource = readFileSync(resolve(process.cwd(), "client/src/pages/Draft.tsx"), "utf8");
    expect(draftSource).toContain("trpc.auth.me.useQuery");
    expect(draftSource).toContain("perfil");
    expect(draftSource).toContain("OWNER_OPEN_ID=");
  });
});
