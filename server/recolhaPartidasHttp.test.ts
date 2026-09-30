import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({ waitUntil: vi.fn(), arranque: vi.fn(), recolher: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: mocks.waitUntil }));
vi.mock("./arranque", () => ({ garantirArranque: mocks.arranque }));
vi.mock("./observedMatchCollection", () => ({ recolherSeForAltura: mocks.recolher }));
import { agendarRecolhaDePartidas } from "./recolhaPartidasHttp";

function resposta() {
  const res = { status: vi.fn(), set: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res); res.set.mockReturnValue(res);
  return res;
}

describe("chamada rápida do agendador", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.arranque.mockResolvedValue(undefined);
    mocks.recolher.mockResolvedValue({ ok: true, battlesInserted: 7 });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("responde antes do arranque e da recolha, mantendo o trabalho registado no waitUntil", async () => {
    let terminar!: () => void;
    mocks.arranque.mockReturnValue(new Promise<void>((resolve) => { terminar = resolve; }));
    const res = resposta();
    agendarRecolhaDePartidas({} as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accepted: true }));
    expect(mocks.recolher).not.toHaveBeenCalled();
    expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
    terminar();
    await mocks.waitUntil.mock.calls[0][0];
    expect(mocks.recolher).toHaveBeenCalledWith("scheduled");
    // A confirmação de receção nunca inventa partidas guardadas.
    expect(res.json.mock.calls[0][0]).not.toHaveProperty("battlesInserted");
  });

  it("regista falha devolvida pela recolha", async () => {
    mocks.recolher.mockResolvedValue({ ok: false, error: "API indisponível" });
    agendarRecolhaDePartidas({} as Request, resposta() as unknown as Response);
    await mocks.waitUntil.mock.calls[0][0];
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("falhou"), expect.stringContaining("API indisponível"));
  });

  it("regista uma janela já atendida sem a anunciar como nova recolha", async () => {
    mocks.recolher.mockResolvedValue({ ok: false, saltada: true, motivo: "Janela já atendida" });
    agendarRecolhaDePartidas({} as Request, resposta() as unknown as Response);
    await mocks.waitUntil.mock.calls[0][0];
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Janela já atendida"), expect.any(String));
    expect(console.error).not.toHaveBeenCalled();
  });

  it("captura exceções de arranque ou da base sem deixar promessa rejeitada", async () => {
    mocks.recolher.mockRejectedValue(new Error("Base inacessível"));
    agendarRecolhaDePartidas({} as Request, resposta() as unknown as Response);
    await expect(mocks.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.any(String), "Base inacessível");
  });
});
