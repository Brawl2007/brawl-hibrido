import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A stream reenviava a snapshot inteira a cada religação.
 *
 * A dos counters pesa cerca de 5,4 MB em produção, e o cliente JÁ a busca por
 * `counterSync.snapshot`: ao abrir a página eram 5,4 MB a dobrar, e depois
 * outros 5,4 MB de cinco em cinco minutos. Dezenas de megabytes por visitante
 * para repetir dados que não mudaram.
 *
 * O SSE já traz a solução: `id:` no evento, `Last-Event-ID` na religação.
 */
describe("a stream não repete o que o navegador já tem", () => {
  const vercel = readFileSync(resolve(process.cwd(), "server/_core/index.vercel.ts"), "utf8");

  it("marca os eventos com a versão publicada", () => {
    // Sem `id:`, o navegador não tem o que devolver e a poupança não acontece.
    expect(vercel).toContain("id: ${snapshot.version}\\nevent: ranked_snapshot");
    expect(vercel).toContain("id: ${snapshot.version}\\nevent: counter_snapshot");
  });

  it("fecha sem corpo quando a marca recebida é a versão atual", () => {
    expect(vercel).toContain("versaoJaConhecida(req, snapshot.version)");
    expect(vercel.match(/versaoJaConhecida\(req, snapshot\.version\)/g) ?? []).toHaveLength(2);
  });

  it("uma versão diferente volta a enviar tudo", () => {
    const comparacao = /function versaoJaConhecida[\s\S]*?\n}/.exec(vercel)?.[0] ?? "";
    expect(comparacao).toContain("marca === versao");
    // Sem versão publicada não há marca válida: envia-se.
    expect(comparacao).toContain("Boolean(versao)");
  });
});
