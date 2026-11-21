import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * v189 — a recolha de partidas corre no GitHub Actions (`recolherNoGithub`).
 * O passo do workflow sai com o código que esta função devolve.
 */
const mocks = vi.hoisted(() => ({ arranque: vi.fn(), recolher: vi.fn() }));
vi.mock("./arranque", () => ({ garantirArranque: mocks.arranque }));
vi.mock("./observedMatchCollection", () => ({ recolherSeForAltura: mocks.recolher }));

import { recolherNoGithub } from "./recolhaNoGithub";

beforeEach(() => {
  mocks.arranque.mockReset().mockResolvedValue(undefined);
  mocks.recolher.mockReset();
});

describe("recolha no GitHub Actions", () => {
  it("sem o segredo da base avisa e não falha, para não mandar um email a cada 15 minutos", async () => {
    const r = await recolherNoGithub({} as NodeJS.ProcessEnv);
    expect(r.codigo).toBe(0);
    expect(r.texto).toContain("::warning::");
    expect(mocks.recolher).not.toHaveBeenCalled();
  });

  it("recolha concluída e janela já atendida saem com 0", async () => {
    const ambiente = { DATABASE_URL: "mysql://x" } as NodeJS.ProcessEnv;
    mocks.recolher.mockResolvedValueOnce({ ok: true, battlesInserted: 7 });
    expect((await recolherNoGithub(ambiente)).codigo).toBe(0);
    mocks.recolher.mockResolvedValueOnce({ ok: false, saltada: true, motivo: "Janela já atendida" });
    expect((await recolherNoGithub(ambiente)).codigo).toBe(0);
    expect(mocks.arranque).toHaveBeenCalledTimes(2);
  });

  it("uma falha da recolha falha o passo, com o diagnóstico", async () => {
    mocks.recolher.mockResolvedValueOnce({ ok: false, errorCode: "DATABASE_WRITE_BLOCKED" });
    const r = await recolherNoGithub({ DATABASE_URL: "mysql://x" } as NodeJS.ProcessEnv);
    expect(r.codigo).toBe(1);
    expect(r.texto).toContain("DATABASE_WRITE_BLOCKED");
  });
});
