import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reservar: vi.fn(), log: vi.fn(), gravar: vi.fn(), config: vi.fn(), configurada: vi.fn() }));
vi.mock("./db", () => ({
  reservarJanelaDasPartidas: mocks.reservar,
  getObservedMatchCollectionConfig: mocks.config,
  createObservedMatchCollectionRun: vi.fn(async () => 1),
  updateObservedMatchCollectionRun: vi.fn(),
  updateObservedMatchCollectionConfig: vi.fn(),
  recordObservedBattlesBatch: mocks.gravar,
  listarJogadoresNaAltura: vi.fn(async () => []),
  lerEstadoDosJogadores: vi.fn(async () => new Map()),
  gravarLeiturasDosJogadores: vi.fn(),
  acrescentarJogadoresALista: vi.fn(async () => ({ acrescentados: 0, naLista: 0 })),
  tirarJogadoresParados: vi.fn(),
}));
vi.mock("./brawlStarsApi", () => ({
  isOfficialApiConfigured: mocks.configurada,
  fetchOfficialRankedPlayers: vi.fn(async () => [{ tag: "#2PP" }]),
  fetchOfficialBattleLog: mocks.log,
}));
vi.mock("./rankedSync", () => ({ RANKED_MAP_SOURCES: [] }));
vi.mock("./appSettings", () => ({ getSetting: vi.fn(async () => null), setSetting: vi.fn() }));
import { recolherSeForAltura } from "./observedMatchCollection";

describe("reserva da recolha entre chamadas concorrentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configurada.mockReturnValue(true);
    mocks.log.mockResolvedValue([]);
    mocks.gravar.mockResolvedValue({ battlesInserted: 0, pairObservations: 0 });
    mocks.config.mockResolvedValue({ lastStatus: "running", lastStartedAt: new Date() });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("só a chamada que reservou a janela lê jogadores e grava o lote", async () => {
    mocks.reservar.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const resultados = await Promise.all([recolherSeForAltura(), recolherSeForAltura()]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => "saltada" in r)).toHaveLength(1);
    expect(mocks.log).toHaveBeenCalledTimes(1);
    expect(mocks.gravar).toHaveBeenCalledTimes(1);
  });

  it("não anuncia sucesso se não conseguiu reservar a base", async () => {
    mocks.reservar.mockRejectedValue(new Error("Base inacessível"));
    await expect(recolherSeForAltura()).rejects.toThrow("Base inacessível");
    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.gravar).not.toHaveBeenCalled();
  });

  it("sem chave da API não reserva nem lê jogadores", async () => {
    mocks.configurada.mockReturnValue(false);
    expect(await recolherSeForAltura()).toMatchObject({ ok: false, error: expect.stringContaining("Sem chave") });
    expect(mocks.reservar).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled();
  });
});
