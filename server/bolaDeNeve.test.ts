import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ESPERAS_SEM_RANKED_MS,
  ESPERA_MAXIMA_MS,
  ESPERA_MINIMA_MS,
  LUGARES_DA_BOLA_DE_NEVE,
  TEMPO_SEM_RANKED_PARA_SAIR_MS,
  escolherLeituras,
  normalizarTag,
  proximaLeitura,
} from "./bolaDeNeve";

/**
 * A bola de neve: os jogadores vistos nas partidas Ranked passam a ser
 * seguidos, lidos mais vezes enquanto jogam e cada vez menos quando param.
 */

const bd = vi.hoisted(() => ({
  naAltura: [] as string[],
  falhaNaLista: false,
  estado: new Map<string, { ultimaLeitura: Date | null; ultimaRanked: Date | null; leiturasVazias: number }>(),
  gravadas: [] as Array<{ tag: string; ultimaLeitura: Date; proxima: Date; ultimaRanked: Date | null; leiturasVazias: number }>,
  acrescentados: [] as string[],
  tiradosAntesDe: null as Date | null,
}));

const api = vi.hoisted(() => ({
  rankings: [] as string[],
  historicos: new Map<string, unknown[]>(),
  lidos: [] as string[],
}));

vi.mock("./db", () => ({
  expirarPartidasAntigas: vi.fn(async () => ({ removidas: 0 })),
  createObservedMatchCollectionRun: vi.fn(async () => 1),
  updateObservedMatchCollectionRun: vi.fn(async () => undefined),
  updateObservedMatchCollectionConfig: vi.fn(async () => undefined),
  getObservedMatchCollectionConfig: vi.fn(async () => undefined),
  recordObservedBattlesBatch: vi.fn(async (lista: unknown[]) => ({ battlesInserted: lista.length, pairObservations: 0 })),
  listarJogadoresNaAltura: vi.fn(async () => {
    if (bd.falhaNaLista) throw new Error("Table 'observed_players' doesn't exist");
    return bd.naAltura;
  }),
  lerEstadoDosJogadores: vi.fn(async (tags: string[]) => new Map(tags.filter((tag) => bd.estado.has(tag)).map((tag) => [tag, bd.estado.get(tag)!]))),
  gravarLeiturasDosJogadores: vi.fn(async (leituras: typeof bd.gravadas) => { bd.gravadas.push(...leituras); }),
  acrescentarJogadoresALista: vi.fn(async (tags: string[]) => { bd.acrescentados.push(...tags); return { acrescentados: tags.length, naLista: tags.length }; }),
  tirarJogadoresParados: vi.fn(async (antesDe: Date) => { bd.tiradosAntesDe = antesDe; }),
}));
vi.mock("./brawlStarsApi", () => ({
  isOfficialApiConfigured: vi.fn(() => true),
  fetchOfficialRankedPlayers: vi.fn(async (pais: string) => (pais === "global" ? api.rankings.map((tag) => ({ tag })) : [])),
  fetchOfficialBattleLog: vi.fn(async (tag: string) => { api.lidos.push(tag); return api.historicos.get(tag) ?? []; }),
}));
vi.mock("./appSettings", () => ({ getSetting: vi.fn(async () => null), setSetting: vi.fn(async () => undefined) }));
vi.mock("./rankedSync", () => ({ RANKED_MAP_SOURCES: [] }));

const { collectObservedRankedMatches, partidasDoHistorico, tagsDasPartidasRanked } = await import("./observedMatchCollection");

const HORA = 3_600_000;
const agora = new Date("2026-09-29T12:00:00.000Z");
const minutosAntes = (minutos: number) => new Date(agora.getTime() - minutos * 60_000);

/** Hora no formato da API: 20260929T115000.000Z. */
function horaDaApi(data: Date) {
  return data.toISOString().replace(/[-:]/g, "").replace(/\.(\d{3})Z$/, ".$1Z");
}

function partida(quando: Date, tipo: string, equipas: string[][]) {
  return {
    battleTime: horaDaApi(quando),
    event: { id: 15000005, mode: "gemGrab", map: "Hard Rock Mine" },
    battle: {
      type: tipo,
      result: "victory",
      teams: equipas.map((equipa) => equipa.map((tag, i) => ({ tag, brawler: { name: `Brawler${tag}${i}`, trophies: 17 } }))),
    },
  };
}

describe("códigos de jogador", () => {
  it("aceita só os caracteres que a Supercell usa, com # à frente", () => {
    expect(normalizarTag("#2pp")).toBe("#2PP");
    expect(normalizarTag(" 9QG8L ")).toBe("#9QG8L");
    expect(normalizarTag("#ENEMY1")).toBeNull();
    expect(normalizarTag("")).toBeNull();
    expect(normalizarTag(undefined)).toBeNull();
    expect(normalizarTag("#2P")).toBeNull();
  });
});

describe("quando voltar a ler um jogador", () => {
  it("quem joga muito volta a ser lido depressa, nunca antes de 15 minutos", () => {
    // 20 partidas na última hora: enche as 25 da API em pouco mais de uma hora.
    const partidas = Array.from({ length: 20 }, (_, i) => ({ quando: minutosAntes(3 * i + 1), ranked: i % 2 === 0 }));
    const lida = proximaLeitura(partidas, { ultimaLeitura: minutosAntes(60), ultimaRanked: null, leiturasVazias: 2 }, agora);
    const espera = lida.proxima.getTime() - agora.getTime();
    expect(lida.rankedNovas).toBe(10);
    expect(lida.leiturasVazias).toBe(0);
    // 60% de 25 partidas, ao ritmo de 20 por hora: 45 minutos.
    expect(espera).toBe(45 * 60_000);

    // 25 partidas em 12 minutos: pelas contas voltava daqui a 7 min; fica nos 15.
    const frenetico = Array.from({ length: 25 }, (_, i) => ({ quando: new Date(agora.getTime() - (i + 1) * 20_000), ranked: true }));
    expect(proximaLeitura(frenetico, { ultimaLeitura: minutosAntes(12), ultimaRanked: null, leiturasVazias: 0 }, agora).proxima.getTime() - agora.getTime()).toBe(ESPERA_MINIMA_MS);
  });

  it("quem joga pouco espera mais, mas nunca mais de 6 horas enquanto joga Ranked", () => {
    const partidas = [{ quando: minutosAntes(30), ranked: true }];
    const lida = proximaLeitura(partidas, { ultimaLeitura: new Date(agora.getTime() - 24 * HORA), ultimaRanked: null, leiturasVazias: 0 }, agora);
    expect(lida.proxima.getTime() - agora.getTime()).toBe(ESPERA_MAXIMA_MS);
    expect(lida.ultimaRanked).toEqual(minutosAntes(30));
  });

  it("só conta as partidas jogadas depois da última leitura", () => {
    // A partida Ranked já tinha sido vista na leitura anterior: não é nova.
    const partidas = [{ quando: minutosAntes(90), ranked: true }, { quando: minutosAntes(10), ranked: false }];
    const lida = proximaLeitura(partidas, { ultimaLeitura: minutosAntes(60), ultimaRanked: minutosAntes(90), leiturasVazias: 0 }, agora);
    expect(lida.rankedNovas).toBe(0);
    expect(lida.leiturasVazias).toBe(1);
    expect(lida.ultimaRanked).toEqual(minutosAntes(90));
  });

  it("quem parou é lido cada vez menos: 1 h, 6 h, 1 dia, 3 dias, e fica nos 3 dias", () => {
    let estado = { ultimaLeitura: minutosAntes(60) as Date | null, ultimaRanked: minutosAntes(600) as Date | null, leiturasVazias: 0 };
    const esperas: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const lida = proximaLeitura([{ quando: minutosAntes(700), ranked: true }], estado, agora);
      esperas.push(lida.proxima.getTime() - agora.getTime());
      estado = { ultimaLeitura: minutosAntes(1), ultimaRanked: lida.ultimaRanked, leiturasVazias: lida.leiturasVazias };
    }
    expect(esperas).toEqual([...ESPERAS_SEM_RANKED_MS, ESPERAS_SEM_RANKED_MS[3]]);
  });

  it("na primeira leitura, o ritmo mede-se desde a partida mais antiga do histórico", () => {
    // 25 partidas em 25 horas: 1 por hora, logo 15 horas até 15 novas — fica nas 6 h.
    const partidas = Array.from({ length: 25 }, (_, i) => ({ quando: new Date(agora.getTime() - (i + 1) * HORA), ranked: true }));
    const lida = proximaLeitura(partidas, undefined, agora);
    expect(lida.rankedNovas).toBe(25);
    expect(lida.proxima.getTime() - agora.getTime()).toBe(ESPERA_MAXIMA_MS);
    expect(lida.ultimaRanked).toEqual(new Date(agora.getTime() - HORA));
  });
});

describe("quem ler em cada recolha", () => {
  const rankings = Array.from({ length: 200 }, (_, i) => `#2${"PYLQGRJCUV"[i % 10]}${"0289"[Math.floor(i / 10) % 4]}${"PQ"[Math.floor(i / 40) % 2]}${"YL"[Math.floor(i / 80) % 2]}${"GR"[Math.floor(i / 160) % 2]}`);
  const lista = Array.from({ length: 200 }, (_, i) => `#9${"PYLQGRJCUV"[i % 10]}${"0289"[Math.floor(i / 10) % 4]}${"PQ"[Math.floor(i / 40) % 2]}${"YL"[Math.floor(i / 80) % 2]}${"GR"[Math.floor(i / 160) % 2]}`);

  it("metade para a lista e metade para os rankings", () => {
    const escolha = escolherLeituras(rankings, lista, 120);
    expect(escolha.tags).toHaveLength(120);
    expect(escolha.daLista).toBe(LUGARES_DA_BOLA_DE_NEVE);
    expect(escolha.dosRankings).toBe(120 - LUGARES_DA_BOLA_DE_NEVE);
    expect(escolha.tags.slice(0, 60)).toEqual(lista.slice(0, 60));
  });

  it("se a lista tem poucos na altura, os rankings ocupam os lugares", () => {
    const escolha = escolherLeituras(rankings, lista.slice(0, 5), 120);
    expect(escolha).toMatchObject({ daLista: 5, dosRankings: 115 });
  });

  it("se os rankings falham, a lista ocupa os lugares todos", () => {
    const escolha = escolherLeituras([], lista, 120);
    expect(escolha).toMatchObject({ daLista: 120, dosRankings: 0 });
  });

  it("não repete jogadores e ignora códigos inválidos", () => {
    const escolha = escolherLeituras(["#2PP", "#2pp", "lixo"], ["#2PP", "#9QG"], 120);
    expect(escolha.tags).toEqual(["#2PP", "#9QG"]);
    expect(escolha).toMatchObject({ daLista: 2, dosRankings: 0 });
  });
});

describe("o histórico como a bola de neve o lê", () => {
  it("só os jogadores das partidas Ranked são candidatos à lista", () => {
    const historico = [
      partida(minutosAntes(5), "soloRanked", [["#2PP", "#2PQ", "#2PR"], ["#2PY", "#2PL", "#2PG"]]),
      partida(minutosAntes(10), "ranked", [["#2PP", "#QQQ", "#RRR"], ["#UUU", "#VVV", "#CCC"]]),
      partida(minutosAntes(15), "teamRanked", [["#2PP", "#2PQ", "#GGG"], ["#2PY", "#lixo!", "#JJJ"]]),
    ];
    expect(tagsDasPartidasRanked(historico).sort()).toEqual(["#2PG", "#2PL", "#2PP", "#2PQ", "#2PR", "#2PY", "#GGG", "#JJJ"].sort());
    expect(partidasDoHistorico(historico).map((p) => p.ranked)).toEqual([true, false, true]);
  });
});

describe("a recolha com a bola de neve", () => {
  beforeEach(() => {
    bd.naAltura = [];
    bd.falhaNaLista = false;
    bd.estado = new Map();
    bd.gravadas = [];
    bd.acrescentados = [];
    bd.tiradosAntesDe = null;
    api.rankings = [];
    api.historicos = new Map();
    api.lidos = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(agora);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lê os da lista, marca quando voltar, junta os novos e tira quem parou", async () => {
    bd.naAltura = ["#9PP"];
    bd.estado.set("#9PP", { ultimaLeitura: minutosAntes(60), ultimaRanked: minutosAntes(60), leiturasVazias: 0 });
    api.rankings = ["#2PP", "#2QQ"];
    api.historicos.set("#9PP", [partida(minutosAntes(20), "soloRanked", [["#9PP", "#9LL", "#9GG"], ["#9RR", "#9JJ", "#2QQ"]])]);
    // Do ranking: #2PP joga Ranked; #2QQ só joga troféus.
    api.historicos.set("#2PP", [partida(minutosAntes(30), "soloRanked", [["#2PP", "#8PP", "#8QQ"], ["#8RR", "#8GG", "#8JJ"]])]);
    api.historicos.set("#2QQ", [partida(minutosAntes(40), "ranked", [["#2QQ", "#7PP", "#7QQ"], ["#7RR", "#7GG", "#7JJ"]])]);

    const resultado = await collectObservedRankedMatches("scheduled");

    expect(resultado).toMatchObject({ ok: true, bolaDeNeve: { lidosDaLista: 1, lidosDosRankings: 2 } });
    expect(api.lidos.sort()).toEqual(["#2PP", "#2QQ", "#9PP"]);
    // Gravam-se os da lista e quem veio do ranking e joga Ranked; #2QQ fica de fora.
    expect(bd.gravadas.map((l) => l.tag).sort()).toEqual(["#2PP", "#9PP"]);
    const do9PP = bd.gravadas.find((l) => l.tag === "#9PP")!;
    expect(do9PP.leiturasVazias).toBe(0);
    expect(do9PP.ultimaRanked).toEqual(minutosAntes(20));
    // Os novos são os das partidas Ranked, sem quem acabou de ser lido (#2QQ foi lido).
    expect(bd.acrescentados.sort()).toEqual(["#8GG", "#8JJ", "#8PP", "#8QQ", "#8RR", "#9GG", "#9JJ", "#9LL", "#9RR"].sort());
    expect(bd.acrescentados).not.toContain("#7PP");
    expect(bd.tiradosAntesDe).toEqual(new Date(agora.getTime() - TEMPO_SEM_RANKED_PARA_SAIR_MS));
  });

  it("não volta a inserir partidas expiradas e conserva a fronteira de 30 dias", async () => {
    api.rankings = ["#2PP"];
    const equipas = [["#2PP", "#8PP"], ["#8RR", "#8GG"]];
    api.historicos.set("#2PP", [
      partida(new Date(agora.getTime() - 31 * 86400000), "soloRanked", equipas),
      partida(new Date(agora.getTime() - 30 * 86400000), "soloRanked", equipas),
      partida(minutosAntes(5), "soloRanked", equipas),
    ]);
    expect(await collectObservedRankedMatches("scheduled")).toMatchObject({ ok: true, rankedFound: 2, battlesInserted: 2 });
  });

  it("se a tabela da lista falhar, a recolha segue só com os rankings", async () => {
    bd.falhaNaLista = true;
    api.rankings = ["#2PP"];
    api.historicos.set("#2PP", [partida(minutosAntes(30), "soloRanked", [["#2PP", "#8PP", "#8QQ"], ["#8RR", "#8GG", "#8JJ"]])]);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const resultado = await collectObservedRankedMatches("scheduled");
    aviso.mockRestore();
    expect(resultado).toMatchObject({ ok: true, rankedFound: 1, bolaDeNeve: { lidosDaLista: 0, lidosDosRankings: 1 } });
  });
});

