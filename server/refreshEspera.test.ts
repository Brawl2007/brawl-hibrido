import { beforeEach, describe, expect, it } from "vitest";
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
