import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EstadoDaRecolha } from "./EstadoDaRecolha";
import { estadoDaCadenciaDasPartidas } from "@shared/agendamentoPartidas";

describe("confirmação visível da recolha", () => {
  it("mostra atraso sem anunciar dados guardados", () => {
    const cadencia = estadoDaCadenciaDasPartidas({ lastStatus: "running", lastStartedAt: "2026-09-30T12:00:00Z" }, true, new Date("2026-09-30T13:00:00Z"));
    const html = renderToStaticMarkup(createElement(EstadoDaRecolha, { cadencia }));
    expect(html).toContain("Recolha atrasada");
    expect(html).toContain("15 minutos");
    expect(html).not.toContain("Guardada:");
  });

  it("distingue último início da confirmação guardada", () => {
    const cadencia = estadoDaCadenciaDasPartidas({ lastStatus: "success", lastStartedAt: "2026-09-30T12:00:00Z", lastCompletedAt: "2026-09-30T12:00:40Z" }, true, new Date("2026-09-30T12:05:00Z"));
    const html = renderToStaticMarkup(createElement(EstadoDaRecolha, { cadencia }));
    expect(html).toContain("Último início:");
    expect(html).toContain("Guardada:");
    expect(html).toContain("Próxima prevista:");
  });

  it("avisa que a cópia para o formato compacto está a decorrer, e cala-se depois", () => {
    const cadencia = estadoDaCadenciaDasPartidas({ lastStatus: "success", lastStartedAt: "2026-09-30T12:00:00Z", lastCompletedAt: "2026-09-30T12:00:40Z" }, true, new Date("2026-09-30T12:05:00Z"));
    const a = renderToStaticMarkup(createElement(EstadoDaRecolha, { cadencia, armazenamento: { armazenamento: "a_migrar", convertidas: 120000 } }));
    expect(a).toContain("Formato compacto");
    expect(a).toContain("continua a usar o formato anterior");
    const b = renderToStaticMarkup(createElement(EstadoDaRecolha, { cadencia, armazenamento: { armazenamento: "compacto" } }));
    expect(b).not.toContain("Formato compacto");
  });
});
