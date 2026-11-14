import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  definicoes: new Map<string, string>(),
  naAltura: [] as string[],
  rankings: [] as string[],
  /** Por jogador: histórico, ou o motivo de falha. */
  respostas: new Map<string, { historico?: unknown[]; falha?: number | "rede" | "tempo" }>(),
  lidos: [] as string[],
  gravadas: [] as Array<{ tag: string }>,
  removidos: [] as string[],
  armazenamento: "legado" as "legado" | "compacto",
}));

vi.mock("./db", () => ({
  expirarPartidasAntigas: vi.fn(async () => ({ removidas: 0 })),
  createObservedMatchCollectionRun: vi.fn(async () => 1),
  updateObservedMatchCollectionRun: vi.fn(async () => undefined),
  updateObservedMatchCollectionConfig: vi.fn(async () => undefined),
  getObservedMatchCollectionConfig: vi.fn(async () => undefined),
  recordObservedBattlesBatch: vi.fn(async (l: unknown[]) => ({ battlesInserted: l.length, pairObservations: 0 })),
  listarJogadoresNaAltura: vi.fn(async (_agora: Date, limite: number) => m.naAltura.slice(0, limite)),
  lerEstadoDosJogadores: vi.fn(async () => new Map()),
  gravarLeiturasDosJogadores: vi.fn(async (l: Array<{ tag: string }>) => { m.gravadas.push(...l); }),
  acrescentarJogadoresALista: vi.fn(async (tags: string[]) => ({ acrescentados: tags.length, naLista: tags.length })),
  tirarJogadoresParados: vi.fn(async () => undefined),
  tirarJogadoresPorTag: vi.fn(async (tags: string[]) => { m.removidos.push(...tags); }),
}));
vi.mock("./brawlStarsApi", () => ({
  isOfficialApiConfigured: vi.fn(() => true),
  fetchOfficialRankedPlayers: vi.fn(async (pais: string) => (pais === "global" ? m.rankings.map((tag) => ({ tag })) : [])),
  fetchOfficialBattleLog: vi.fn(async (tag: string, aoFalhar?: (f: number | "rede" | "tempo") => void) => {
    m.lidos.push(tag);
    const r = m.respostas.get(tag);
    if (r?.falha !== undefined) { aoFalhar?.(r.falha); return []; }
    return r?.historico ?? [];
  }),
}));
vi.mock("./appSettings", () => ({
  getSetting: vi.fn(async (k: string) => m.definicoes.get(k) ?? null),
  getSettingFresh: vi.fn(async (k: string) => m.definicoes.get(k) ?? null),
  setSetting: vi.fn(async (k: string, v: string) => { m.definicoes.set(k, v); }),
}));
vi.mock("./migracaoCompacta", () => ({ lerArmazenamento: vi.fn(async () => m.armazenamento), avancarMigracao: vi.fn(async () => null), DIAS_NOS_PACOTES: 31 }));
vi.mock("./pacotesDePartidas", () => ({ gravarEmPacotes: vi.fn(async (p: unknown[]) => ({ novas: p.length, grupos: 1 })), compactarDiasFechados: vi.fn(async () => ({ juntados: 0, pendentes: 0 })), expirarPacotes: vi.fn() }));

const { collectObservedRankedMatches } = await import("./observedMatchCollection");

const tag = (i: number) => "#" + i.toString(8).padStart(4, "0").replace(/[0-7]/g, (d) => "0289PYLQ"[Number(d)]);
const horaDaApi = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.(\d{3})Z$/, ".$1Z");
const partidaRanked = (jogador: string, outros: string[]) => ({
  battleTime: horaDaApi(new Date(Date.now() - 5 * 60_000)),
  event: { id: 15000005, mode: "gemGrab", map: "Hard Rock Mine" },
  battle: { type: "soloRanked", result: "victory", teams: [[jogador, outros[0], outros[1]], [outros[2], outros[3], outros[4]]].map((e, l) => e.map((t, i) => ({ tag: t, brawler: { name: `B${l}${i}`, trophies: 17, power: 11 } }))) },
});
const ritmoGuardado = () => JSON.parse(m.definicoes.get("ritmoDaRecolha")!);

beforeEach(() => {
  m.definicoes.clear(); m.naAltura = []; m.rankings = []; m.respostas.clear(); m.lidos = []; m.gravadas = []; m.removidos = []; m.armazenamento = "legado";
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("leituras falhadas não são jogadores sem partidas", () => {
  it("um jogador cuja leitura falhou não é gravado como «sem Ranked», e o ritmo corta para metade com 429", async () => {
    m.naAltura = [tag(1), tag(2), tag(3)];
    m.respostas.set(tag(1), { historico: [partidaRanked(tag(1), [tag(11), tag(12), tag(13), tag(14), tag(15)])] });
    m.respostas.set(tag(2), { falha: 429 });
    m.respostas.set(tag(3), { falha: 429 });
    m.definicoes.set("ritmoDaRecolha", JSON.stringify({ jogadores: 600, concorrencia: 12 }));
    const r = await collectObservedRankedMatches("scheduled");
    expect(r).toMatchObject({ ok: true, playersSampled: 1, falhas: { "429": 2 }, ritmo: { jogadores: 300, concorrencia: 10 } });
    expect(m.gravadas.map((l) => l.tag)).toEqual([tag(1)]);
    expect(ritmoGuardado()).toEqual({ jogadores: 300, concorrencia: 10 });
    expect(JSON.parse(m.definicoes.get("ultimaVoltaDaRecolha")!)).toMatchObject({ pedidos: 3, lidos: 1, falhas: { "429": 2 } });
  });

  it("um jogador que não existe (404) sai da lista", async () => {
    m.naAltura = [tag(1), tag(2)];
    m.respostas.set(tag(2), { falha: 404 });
    await collectObservedRankedMatches("scheduled");
    expect(m.removidos).toEqual([tag(2)]);
  });

  it("se nenhuma leitura teve resposta, a volta falha com um diagnóstico claro", async () => {
    m.naAltura = [tag(1), tag(2)];
    m.respostas.set(tag(1), { falha: 403 });
    m.respostas.set(tag(2), { falha: 403 });
    expect(await collectObservedRankedMatches("scheduled")).toMatchObject({ ok: false, errorCode: "OFFICIAL_API_READS_FAILED" });
    expect(m.definicoes.has("ritmoDaRecolha")).toBe(false);
  });

  it("uma volta limpa sobe o ritmo em 60 jogadores, mas só depois da migração para os pacotes", async () => {
    m.naAltura = [tag(1)];
    await collectObservedRankedMatches("scheduled");
    expect(ritmoGuardado()).toEqual({ jogadores: 240, concorrencia: 10 });
    m.armazenamento = "compacto";
    await collectObservedRankedMatches("scheduled");
    expect(ritmoGuardado()).toEqual({ jogadores: 300, concorrencia: 11 });
  });
});

describe("quantos jogadores se leem", () => {
  it("com a lista cheia de gente à espera, ela leva quase todos os lugares e os rankings uma fatia mínima", async () => {
    m.naAltura = Array.from({ length: 400 }, (_, i) => tag(i + 100));
    m.rankings = Array.from({ length: 200 }, (_, i) => tag(i + 1000));
    const r = await collectObservedRankedMatches("scheduled");
    expect(r).toMatchObject({ ok: true, bolaDeNeve: { lidosDaLista: 211, lidosDosRankings: 29 } });
    expect(m.lidos).toHaveLength(240);
  });

  it("sem gente à espera na lista, os rankings ocupam os lugares que sobram", async () => {
    m.naAltura = [tag(1), tag(2)];
    m.rankings = Array.from({ length: 500 }, (_, i) => tag(i + 1000));
    const r = await collectObservedRankedMatches("scheduled");
    expect(r).toMatchObject({ ok: true, bolaDeNeve: { lidosDaLista: 2, lidosDosRankings: 238 } });
  });
});
