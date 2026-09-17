import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INTERVALO_DE_RELIGACAO_MS } from "@shared/realtimeStream";

/**
 * A stream de tempo real no alojamento sem processo.
 *
 * Os dois endpoints seguravam a ligação aberta com um heartbeat até ao limite
 * de 300 segundos da plataforma, à espera de empurrões da sincronização. Esses
 * empurrões percorrem um `Set` em memória do módulo, e a sincronização corre
 * noutra invocação: nunca chegavam. Eram até dez minutos de tempo de função por
 * visitante, os dois endpoints somados, a troco de nada.
 *
 * O ponto é o alojamento, não o código de tempo real: o `server/_core/index.ts`
 * serve um processo que fica de pé, onde o empurrão funciona, e tem de manter a
 * ligação aberta.
 */
describe("stream de tempo real no alojamento sem processo", () => {
  const vercel = readFileSync(resolve(process.cwd(), "server/_core/index.vercel.ts"), "utf8");
  const dePe = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");

  it("fecha a ligação em vez de a segurar", () => {
    expect(vercel).not.toContain("heartbeat");
    expect(vercel).not.toContain("addRankedClient");
    expect(vercel).not.toContain("addCounterClient");
    // Um por endpoint.
    expect(vercel.match(/res\.end\(\);/g) ?? []).toHaveLength(2);
  });

  it("diz ao navegador quando voltar, para o fecho não virar chuva de pedidos", () => {
    expect(vercel).toContain("retry: ${INTERVALO_DE_RELIGACAO_MS}");
    expect(INTERVALO_DE_RELIGACAO_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("deixa o servidor que fica de pé como estava", () => {
    expect(dePe).toContain("addRankedClient");
    expect(dePe).toContain("addCounterClient");
    expect(dePe).toContain("heartbeat");
  });
});
