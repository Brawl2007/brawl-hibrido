import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { arrancarEEsperar, getSyncJobState, resetSyncJobsForTests } from "./syncJobs";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * O botão "Atualizar agora" num alojamento sem processo.
 *
 * O feitio antigo — arrancar e responder já — supõe um servidor que fica de pé
 * a trabalhar depois de responder. Numa função, a resposta congela a instância
 * e o trabalho para. O botão anunciava uma atualização que não acontecia.
 */
describe("o botão espera pelo trabalho", () => {
  beforeEach(() => resetSyncJobsForTests());

  it("responde só depois de a recolha acabar, e diz que acabou", async () => {
    let terminou = false;
    const resultado = await arrancarEEsperar("curto", async () => { await dormir(20); terminou = true; }, 1_000);
    expect(terminou).toBe(true);
    expect(resultado.concluido).toBe(true);
    expect(resultado.state.outcome).toBe("success");
  });

  /**
   * O caso dos counters: são centenas de fichas espaçadas e não cabem no tempo
   * de uma função. Aqui o que interessa é não MENTIR — responder dentro do
   * orçamento e assinalar que ficou a meio.
   */
  it("desiste de esperar dentro do orçamento e não diz que acabou", async () => {
    const inicio = Date.now();
    const resultado = await arrancarEEsperar("longo", () => dormir(5_000), 60);
    expect(Date.now() - inicio).toBeLessThan(1_000);
    expect(resultado.concluido).toBe(false);
    expect(resultado.state.running).toBe(true);
  });

  it("uma recolha falhada é reportada, não engolida", async () => {
    const resultado = await arrancarEEsperar("falha", async () => { throw new Error("a fonte recusou"); }, 1_000);
    expect(resultado.concluido).toBe(true);
    expect(resultado.state.outcome).toBe("error");
    expect(resultado.state.error).toContain("a fonte recusou");
  });

  it("carregar duas vezes não corre duas vezes", async () => {
    let corridas = 0;
    const trabalho = async () => { corridas += 1; await dormir(50); };
    const [primeiro, segundo] = await Promise.all([
      arrancarEEsperar("repetido", trabalho, 1_000),
      arrancarEEsperar("repetido", trabalho, 1_000),
    ]);
    expect(corridas).toBe(1);
    expect(primeiro.concluido && segundo.concluido).toBe(true);
    expect(getSyncJobState("repetido").outcome).toBe("success");
  });
});

/**
 * A falha tem de ser dita a quem carregou no botão.
 *
 * "Terminou" não é "correu bem". Uma recolha que rebenta também termina, e
 * anunciar "atualizado" nesse caso esconde a razão de quem precisa dela para
 * perceber porque é que os números não mudaram.
 */
describe("o ecrã não pode anunciar o que não aconteceu", () => {
  const hook = readFileSync(resolve(process.cwd(), "client/src/lib/useSyncRefresh.ts"), "utf8");

  it("só festeja quando o resultado é mesmo sucesso", () => {
    // Um `concluido` verdadeiro sozinho não chega para dizer "atualizado".
    expect(hook).toContain('estado?.outcome === "success"');
    expect(hook).not.toMatch(/if \(resultado\?\.concluido\) toast\.success/);
  });

  it("mostra a razão da falha, que é o que explica os números parados", () => {
    expect(hook).toContain("toast.error");
    expect(hook).toMatch(/description:\s*estado\??\.?error/);
  });
});
