import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reservar: vi.fn(), log: vi.fn(), gravar: vi.fn(), config: vi.fn(), configurada: vi.fn(), criar: vi.fn(), atualizarRun: vi.fn(), atualizarConfig: vi.fn() }));
vi.mock("./db", () => ({
  expirarPartidasAntigas: vi.fn(async () => ({ removidas: 0 })),
  reservarJanelaDasPartidas: mocks.reservar,
  getObservedMatchCollectionConfig: mocks.config,
  createObservedMatchCollectionRun: mocks.criar,
  updateObservedMatchCollectionRun: mocks.atualizarRun,
  updateObservedMatchCollectionConfig: mocks.atualizarConfig,
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
import { collectObservedRankedMatches, recolherSeForAltura } from "./observedMatchCollection";

describe("reserva da recolha entre chamadas concorrentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reservar.mockReset();
    mocks.criar.mockReset();
    mocks.atualizarRun.mockReset();
    mocks.atualizarConfig.mockReset();
    mocks.criar.mockResolvedValue(1);
    mocks.atualizarRun.mockResolvedValue(undefined);
    mocks.atualizarConfig.mockResolvedValue(undefined);
    mocks.configurada.mockReturnValue(true);
    mocks.log.mockResolvedValue([]);
    mocks.gravar.mockResolvedValue({ battlesInserted: 0, pairObservations: 0 });
    mocks.config.mockResolvedValue({ lastStatus: "running", lastStartedAt: new Date() });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
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
    await expect(recolherSeForAltura()).resolves.toMatchObject({ ok: false, etapa: "reserva", errorCode: "PARTIDAS_UNAVAILABLE" });
    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.gravar).not.toHaveBeenCalled();
  });

  it("identifica o bloqueio de escrita escondido pelo erro de SQL sem consultar jogadores", async () => {
    mocks.reservar.mockRejectedValue(new Error("Failed query: update segredo params: password", {
      cause: Object.assign(new Error("Servidor em leitura"), { code: "ER_OPTION_PREVENTS_STATEMENT", errno: 1290 }),
    }));
    const resultado = await recolherSeForAltura();
    expect(resultado).toMatchObject({ ok: false, etapa: "reserva", errorCode: "DATABASE_WRITE_BLOCKED" });
    expect(JSON.stringify(resultado)).not.toMatch(/segredo|password|Failed query/);
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("preserva a causa original mesmo quando a base também recusa gravar o estado da falha", async () => {
    mocks.criar.mockRejectedValue(new Error("query", { cause: { code: "ER_RECORD_FILE_FULL" } }));
    mocks.atualizarRun.mockRejectedValue(new Error("falha secundária run"));
    mocks.atualizarConfig.mockRejectedValue(new Error("falha secundária config"));
    await expect(collectObservedRankedMatches("scheduled")).resolves.toMatchObject({
      ok: false, errorCode: "DATABASE_STORAGE_FULL",
    });
    expect(mocks.atualizarRun).toHaveBeenCalled();
    expect(mocks.atualizarConfig).toHaveBeenCalled();
  });

  it("sem chave da API não reserva nem lê jogadores", async () => {
    mocks.configurada.mockReturnValue(false);
    expect(await recolherSeForAltura()).toMatchObject({ ok: false, error: expect.stringContaining("Sem chave") });
    expect(await collectObservedRankedMatches("manual")).toMatchObject({ ok: false, errorCode: "OFFICIAL_API_NOT_CONFIGURED", error: expect.stringContaining("Sem chave da API oficial") });
    expect(mocks.reservar).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled();
  });
});


