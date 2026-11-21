import { describe, expect, it } from "vitest";
import { estadoDaCadenciaDasPartidas, inicioDaJanelaDasPartidas, podeRecolherAgora, proximaHoraDasPartidas } from "@shared/agendamentoPartidas";

const data = (hora: string) => new Date(`2026-09-30T${hora}Z`);
const sucesso = (hora: string) => ({ lastStatus: "success", lastStartedAt: data(hora), lastCompletedAt: data(hora) });

describe("relógio das partidas (de hora a hora desde a v190)", () => {
  it("não perde a volta seguinte quando o primeiro pedido chegou alguns segundos mais tarde", () => {
    expect(podeRecolherAgora(sucesso("12:00:06"), data("13:00:02")).pode).toBe(true);
    expect(podeRecolherAgora(sucesso("13:00:02"), data("14:00:01")).pode).toBe(true);
    expect(podeRecolherAgora(sucesso("14:00:01"), data("15:00:00")).pode).toBe(true);
  });

  it("tolera o agendador alguns segundos adiantado, sem permitir outra volta na mesma janela", () => {
    const cedo = sucesso("12:59:56");
    expect(proximaHoraDasPartidas(cedo.lastStartedAt)).toEqual(data("14:00:00"));
    expect(podeRecolherAgora(cedo, data("13:00:03")).pode).toBe(false);
    expect(podeRecolherAgora(cedo, data("13:18:00")).pode).toBe(false);
    expect(podeRecolherAgora(cedo, data("13:59:56")).pode).toBe(true);
    expect(inicioDaJanelaDasPartidas(data("12:59:56"))).toEqual(inicioDaJanelaDasPartidas(data("13:18:00")));
  });

  it("não sobrepõe uma recolha ativa na passagem de janela", () => {
    expect(podeRecolherAgora({ lastStatus: "running", lastStartedAt: data("12:13:00") }, data("12:15:00")).pode).toBe(false);
    expect(podeRecolherAgora({ lastStatus: "running", lastStartedAt: data("11:30:00") }, data("12:15:00")).pode).toBe(true);
  });

  it("atravessa a meia-noite sem alongar o intervalo", () => {
    expect(proximaHoraDasPartidas(data("23:45:02")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(podeRecolherAgora(sucesso("23:45:02"), new Date("2026-10-01T00:00:01Z")).pode).toBe(true);
  });

  it("mostra o atraso e não transforma previsão ou erro em confirmação de recolha", () => {
    const config = sucesso("12:00:02");
    expect(estadoDaCadenciaDasPartidas(config, true, data("13:00:00")).estado).toBe("em_dia");
    expect(estadoDaCadenciaDasPartidas(config, true, data("13:02:00")).estado).toBe("atrasada");
    const falhou = estadoDaCadenciaDasPartidas({ ...config, lastStatus: "failed", lastError: "API indisponível" }, true, data("12:01:00"));
    expect(falhou).toMatchObject({ estado: "falhou", ultimaConclusao: null, erro: "API indisponível" });
    expect(estadoDaCadenciaDasPartidas(undefined, true).estado).toBe("sem_recolhas");
    expect(estadoDaCadenciaDasPartidas(config, false).estado).toBe("sem_chave");
  });

  it("assinala recolha presa em vez de a deixar como ativa para sempre", () => {
    const config = { lastStatus: "running", lastStartedAt: data("12:00:00") };
    expect(estadoDaCadenciaDasPartidas(config, true, data("12:03:00")).estado).toBe("a_recolher");
    expect(estadoDaCadenciaDasPartidas(config, true, data("12:11:00")).estado).toBe("atrasada");
  });
});
