import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  armazenamento: "legado" as "legado" | "a_migrar" | "compacto",
  definicoes: new Map<string, string>(),
  historico: [] as unknown[],
}));
const fn = vi.hoisted(() => ({
  gravarEmPacotes: vi.fn(async (p: unknown[]) => ({ novas: p.length, grupos: 1 })),
  compactarDiasFechados: vi.fn(async () => ({ juntados: 0, pendentes: 0 })),
  expirarPacotes: vi.fn(async () => undefined),
  avancarMigracao: vi.fn(async () => ({ armazenamento: "a_migrar" as const, convertidas: 0 })),
  recordObservedBattlesBatch: vi.fn(async (l: unknown[]) => ({ battlesInserted: l.length, pairObservations: l.length * 18 })),
  expirarPartidasAntigas: vi.fn(async () => ({ removidas: 0 })),
}));

vi.mock("./db", () => ({
  expirarPartidasAntigas: fn.expirarPartidasAntigas,
  createObservedMatchCollectionRun: vi.fn(async () => 1),
  updateObservedMatchCollectionRun: vi.fn(async () => undefined),
  updateObservedMatchCollectionConfig: vi.fn(async () => undefined),
  getObservedMatchCollectionConfig: vi.fn(async () => undefined),
  recordObservedBattlesBatch: fn.recordObservedBattlesBatch,
  listarJogadoresNaAltura: vi.fn(async () => []),
  lerEstadoDosJogadores: vi.fn(async () => new Map()),
  gravarLeiturasDosJogadores: vi.fn(async () => undefined),
  acrescentarJogadoresALista: vi.fn(async () => ({ acrescentados: 0, naLista: 0 })),
  tirarJogadoresParados: vi.fn(async () => undefined),
}));
vi.mock("./brawlStarsApi", () => ({
  isOfficialApiConfigured: vi.fn(() => true),
  fetchOfficialRankedPlayers: vi.fn(async (pais: string) => (pais === "global" ? [{ tag: "#2PP" }] : [])),
  fetchOfficialBattleLog: vi.fn(async () => m.historico),
}));
vi.mock("./appSettings", () => ({
  getSetting: vi.fn(async (k: string) => m.definicoes.get(k) ?? null),
  setSetting: vi.fn(async (k: string, v: string) => { m.definicoes.set(k, v); }),
  getSettingFresh: vi.fn(async () => null),
}));
vi.mock("./migracaoCompacta", () => ({
  lerArmazenamento: vi.fn(async () => m.armazenamento),
  avancarMigracao: fn.avancarMigracao,
  DIAS_NOS_PACOTES: 31,
}));
vi.mock("./pacotesDePartidas", () => ({
  gravarEmPacotes: fn.gravarEmPacotes,
  compactarDiasFechados: fn.compactarDiasFechados,
  expirarPacotes: fn.expirarPacotes,
}));

const { collectObservedRankedMatches } = await import("./observedMatchCollection");

const horaDaApi = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.(\d{3})Z$/, ".$1Z");
const partidaRecente = () => ({
  battleTime: horaDaApi(new Date(Date.now() - 5 * 60_000)),
  event: { id: 15000005, mode: "gemGrab", map: "Hard Rock Mine" },
  battle: {
    type: "soloRanked", result: "victory",
    teams: [["#2PP", "#8PP", "#8QQ"], ["#8RR", "#8GG", "#8JJ"]].map((e, lado) => e.map((tag, i) => ({ tag, brawler: { name: lado ? `Inimigo${i}` : `Aliado${2 - i}`, trophies: 17, power: 11 } }))),
  },
});

beforeEach(() => {
  m.armazenamento = "legado"; m.definicoes.clear(); m.historico = [partidaRecente()];
  for (const f of Object.values(fn)) f.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("a recolha conforme o armazenamento", () => {
  it("compacto: grava só nos pacotes, com a partida já no formato compacto", async () => {
    m.armazenamento = "compacto";
    const r = await collectObservedRankedMatches("scheduled");
    expect(r).toMatchObject({ ok: true, battlesInserted: 1, pairObservations: 18, armazenamento: "compacto" });
    expect(fn.recordObservedBattlesBatch).not.toHaveBeenCalled();
    expect(fn.expirarPartidasAntigas).not.toHaveBeenCalled();
    expect(fn.avancarMigracao).not.toHaveBeenCalled();
    const [[partidas]] = fn.gravarEmPacotes.mock.calls as unknown as [[Array<{ mapId: string; mode: string; batalha: Record<string, unknown> }>]];
    expect(partidas).toHaveLength(1);
    expect(partidas[0]).toMatchObject({ mapId: "15000005", mode: "gemgrab" });
    expect(partidas[0].batalha).toMatchObject({ vencedores: ["Aliado0", "Aliado1", "Aliado2"], derrotados: ["Inimigo0", "Inimigo1", "Inimigo2"], rank: 17, nivel11: true });
    expect(typeof partidas[0].batalha.t).toBe("number");
  });

  it("compacto: junta os dias fechados em cada volta e expira os antigos uma vez por dia", async () => {
    m.armazenamento = "compacto";
    await collectObservedRankedMatches("scheduled");
    await collectObservedRankedMatches("scheduled");
    expect(fn.compactarDiasFechados).toHaveBeenCalledTimes(2);
    expect(fn.expirarPacotes).toHaveBeenCalledTimes(1);
  });

  it("a_migrar: continua a gravar no histórico antigo, não o expira e avança a cópia", async () => {
    m.armazenamento = "a_migrar";
    await collectObservedRankedMatches("scheduled");
    expect(fn.recordObservedBattlesBatch).toHaveBeenCalledTimes(1);
    expect(fn.gravarEmPacotes).not.toHaveBeenCalled();
    expect(fn.expirarPartidasAntigas).not.toHaveBeenCalled();
    expect(fn.avancarMigracao).toHaveBeenCalledTimes(1);
  });

  it("legado: tudo como antes e começa a migração", async () => {
    await collectObservedRankedMatches("scheduled");
    expect(fn.recordObservedBattlesBatch).toHaveBeenCalledTimes(1);
    expect(fn.expirarPartidasAntigas).toHaveBeenCalledTimes(1);
    expect(fn.avancarMigracao).toHaveBeenCalledTimes(1);
  });

  it("uma migração que falha não faz falhar a recolha já gravada", async () => {
    fn.avancarMigracao.mockRejectedValueOnce(new Error("sem espaço"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await collectObservedRankedMatches("scheduled")).toMatchObject({ ok: true, battlesInserted: 1 });
  });
});
