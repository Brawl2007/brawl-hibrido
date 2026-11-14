import { beforeEach, describe, expect, it, vi } from "vitest";
import { empacotar, diaDaBatalha, type BatalhaCompacta } from "@shared/partidasCompactas";

type Pacote = { mapId: string; mode: string; dia: string; dados: string };
const mundo = vi.hoisted(() => ({ pacotes: [] as Array<{ mapId: string; mode: string; dia: string; dados: string }>, leituras: 0 }));

vi.mock("./db", () => ({ percorrerPartidasParaResumo: vi.fn(), listObservedMapsParaResumo: vi.fn() }));
vi.mock("./rankedSync", () => ({ getPublicRankedSnapshot: vi.fn() }));
vi.mock("./terrenoDoMapa", () => ({ obterTerreno: vi.fn() }));
vi.mock("./observedMatchCollection", () => ({ lerNomesDosMapas: vi.fn(async () => ({ "15000001": "Hard Rock Mine", "15000002": "Crystal Arcade" })) }));
vi.mock("./migracaoCompacta", () => ({ lerArmazenamento: vi.fn(async () => "compacto") }));
vi.mock("./pacotesDePartidas", () => ({
  percorrerPacotes: vi.fn(async (f: { desdeDia: string; mapId?: string; mode?: string }, consumir: (l: Pacote) => void) => {
    mundo.leituras += 1;
    for (const p of mundo.pacotes) if (p.dia >= f.desdeDia && (!f.mapId || p.mapId === f.mapId) && (!f.mode || p.mode === f.mode)) consumir(p);
  }),
  modoDoMapa: vi.fn(async (mapId: string) => mundo.pacotes.find((p) => p.mapId === mapId)?.mode ?? null),
  lerResumoGuardado: vi.fn(async () => null),
  guardarResumo: vi.fn(async () => undefined),
}));

const agora = Date.now() / 1000;
const batalha = (horasAtras: number, venc: string[], derr: string[], rank = 17): BatalhaCompacta => ({
  t: Math.floor(agora - horasAtras * 3600), vencedores: venc, derrotados: derr, rank, nivel11: true,
});
const juntar = (mapId: string, mode: string, batalhas: BatalhaCompacta[]) => {
  const porDia = new Map<string, BatalhaCompacta[]>();
  for (const b of batalhas) porDia.set(diaDaBatalha(b.t), [...(porDia.get(diaDaBatalha(b.t)) ?? []), b]);
  for (const [dia, lista] of porDia) mundo.pacotes.push({ mapId, mode, dia, dados: empacotar(lista) });
};
const A = ["COLT", "NITA", "POCO"], B = ["BULL", "SHELLY", "PIPER"], C = ["BEA", "GALE", "ROSA"];

beforeEach(() => {
  vi.resetModules();
  mundo.pacotes = []; mundo.leituras = 0;
  // Mapa 1 (gemgrab): 5 partidas A>B e 1 B>C com rank baixo. Mapa 2 (gemgrab): 2 partidas C>A. Mapa 3 (brawlball): 1 partida.
  juntar("15000001", "gemgrab", [...Array.from({ length: 5 }, (_, i) => batalha(i + 1, A, B, 20)), batalha(7, B, C, 14)]);
  juntar("15000002", "gemgrab", [batalha(2, C, A), batalha(3, C, A)]);
  juntar("15000003", "brawlball", [batalha(4, ["EMZ", "FANG", "GUS"], ["MAX", "MIKE", "NANI"])]);
});

describe("resumos lidos dos pacotes", () => {
  it("o resumo do Draft traz o mapa e, de apoio, o modo inteiro — e nada de outros modos", async () => {
    const { resumoParaODraft } = await import("./partidasResumo");
    const r = await resumoParaODraft({ mapId: "15000001" });
    expect(r).toMatchObject({ mapId: "15000001", modeId: "gemgrab", partidas: 6 });
    const nomes = new Set(r.brawlers.map((b) => b.brawler));
    expect(nomes.has("COLT") && nomes.has("ROSA")).toBe(true);
    expect(nomes.has("EMZ")).toBe(false);
    const colt = r.brawlers.find((b) => b.brawler === "COLT")!;
    expect(colt).toMatchObject({ jogos: 5, vitorias: 5 });
    expect(r.priorModo.brawlers.find((b) => b.brawler === "COLT")).toMatchObject({ jogos: 7 });
    expect(r.priorModo.brawlers.some((b) => b.brawler === "EMZ")).toBe(false);
    expect(r.confrontos.find((c) => c.a === "COLT" && c.b === "BULL")).toMatchObject({ jogos: 5, vitorias: 5 });
    expect(r.partidasPonderadas).toBeGreaterThan(0);
  });

  it("não envia trios com menos de 3 jogos", async () => {
    const { resumoParaODraft } = await import("./partidasResumo");
    const r = await resumoParaODraft({ mapId: "15000001" });
    expect(r.equipas.every((e) => e.jogos >= 3)).toBe(true);
    expect(r.equipas.map((e) => e.membros.join())).toContain(["COLT", "NITA", "POCO"].join());
    expect(r.priorModo.equipas.every((e) => e.jogos >= 3)).toBe(true);
  });

  it("o filtro de rank deixa só as partidas desse rank", async () => {
    const { resumoParaODraft } = await import("./partidasResumo");
    const r = await resumoParaODraft({ mapId: "15000001", rank: "mestre" });
    expect(r.partidas).toBe(5);
    expect(r.brawlers.some((b) => b.brawler === "ROSA")).toBe(false);
  });

  it("fora do período não conta", async () => {
    const { resumoParaODraft } = await import("./partidasResumo");
    juntar("15000001", "gemgrab", [batalha(50, A, B, 20)]); // há mais de um dia
    expect((await resumoParaODraft({ mapId: "15000001", dias: 1 })).partidas).toBe(6);
    expect((await resumoParaODraft({ mapId: "15000001", dias: 30 })).partidas).toBe(7);
  });

  it("um mapa desconhecido devolve um resumo vazio, não um erro", async () => {
    const { resumoParaODraft } = await import("./partidasResumo");
    expect(await resumoParaODraft({ mapId: "999" })).toMatchObject({ partidas: 0, brawlers: [], confrontos: [] });
  });

  it("repetir o pedido usa o resumo guardado, sem reler os pacotes", async () => {
    const { resumoParaODraft } = await import("./partidasResumo");
    await resumoParaODraft({ mapId: "15000001" });
    const antes = mundo.leituras;
    await resumoParaODraft({ mapId: "15000001" });
    expect(mundo.leituras).toBe(antes);
  });

  it("os mapas trazem contagens por mapa e por brawler, com os nomes", async () => {
    const { resumoDosMapas } = await import("./partidasResumo");
    const r = await resumoDosMapas({});
    expect(r.mapas.map((m) => [m.mapId, m.partidas, m.mode])).toEqual([["15000001", 6, "gemgrab"], ["15000002", 2, "gemgrab"], ["15000003", 1, "brawlball"]]);
    expect(r.mapas[0].nome).toBe("Hard Rock Mine");
    expect(r.brawlersPorMapa["15000002"].find((b) => b.brawler === "ROSA")).toMatchObject({ jogos: 2, vitorias: 2 });
    expect(r.brawlersPorModo.brawlball.map((b) => b.brawler)).toContain("EMZ");
    expect(r.partidasPonderadasPorMapa["15000001"]).toBeGreaterThan(0);
  });

  it("a página Partidas filtrada por mapa continua a listar todos os mapas", async () => {
    const { resumoDasPartidas } = await import("./partidasResumo");
    const r = await resumoDasPartidas({ mapId: "15000002" });
    expect(r.partidas).toBe(2);
    expect(r.mapas.map((m) => m.mapId).sort()).toEqual(["15000001", "15000002", "15000003"]);
    expect(r.modos.map((m) => [m.mode, m.partidas]).sort()).toEqual([["brawlball", 1], ["gemgrab", 8]]);
  });
});
