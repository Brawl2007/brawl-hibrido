import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ guardados: [] as { mapId: string; payload: string }[] }));
vi.mock("./db", () => ({
  upsertRankedMapCaptures: vi.fn(async (rows: { mapId: string; payload: string }[]) => { db.guardados.push(...rows); return rows.length; }),
}));
vi.mock("./arranque", () => ({ garantirArranque: vi.fn(async () => undefined) }));
const definicoes = vi.hoisted(() => ({
  guardadas: new Map<string, string | null>(),
  setSetting: vi.fn(),
  getSetting: vi.fn(),
}));
definicoes.setSetting.mockImplementation(async (chave: string, valor: string | null) => { definicoes.guardadas.set(chave, valor); return valor; });
definicoes.getSetting.mockImplementation(async (chave: string) => definicoes.guardadas.get(chave) ?? null);
vi.mock("./appSettings", () => definicoes);

import { guardarPaginasRanked, rankedPaginasSchema } from "./rankedImport";
import { ROTACAO_GUARDADA_SETTING, lerRotacaoGuardada } from "@shared/rotacaoGuardada";

const script = (linhas: string) => `self.__next_f.push([1,"{\\"maps\\":[{${linhas}}]}"])`;
const linha = (id: number, nome: string, win: number) =>
  `\\"brawlerId\\":${id},\\"brawlerName\\":\\"${nome}\\",\\"winRate\\":${win},\\"useRate\\":0.08,\\"effectivityRate\\":2.5`;

const pagina = (mapId: string, map: string, scripts: string) => ({
  mapId, map, capturedAt: "2026-09-17T12:00:00.000Z", scripts,
});

/**
 * Um índice de rotação como o TopBrawl o publica: cabeçalho de modo, e a
 * seguir os mapas desse modo, cada um com a miniatura `alt="Map <nome>"` e a
 * ligação para `/rankeds/<id>`.
 */
function indice(mapas: Array<[string, string, string]>) {
  const porModo = new Map<string, Array<[string, string]>>();
  for (const [modo, nome, id] of mapas) {
    porModo.set(modo, [...(porModo.get(modo) ?? []), [nome, id]]);
  }
  const blocos = Array.from(porModo.entries()).map(([modo, lista]) =>
    `<section><h2>${modo}</h2>${lista.map(([nome, id]) =>
      `<a href="/rankeds/${id}"><img alt="Map ${nome}" src="/m/${id}.png"><h3>${nome}</h3></a>`).join("")}</section>`);
  return `<!doctype html><html><body><main>${blocos.join("")}</main></body></html>`;
}

/** Vinte e seis mapas plausíveis, repartidos pelos modos que a rotação usa. */
function rotacaoDe(nomes: string[]) {
  const modos = ["Gem Grab", "Brawl Ball", "Knockout", "Heist", "Hot Zone", "Bounty"];
  return indice(nomes.map((nome, i) => [modos[i % modos.length], nome, `1500${String(1000 + i)}`] as [string, string, string]));
}

describe("mapas do TopBrawl trazidos pela extensão", () => {
  beforeEach(() => { db.guardados = []; definicoes.guardadas.clear(); vi.clearAllMocks(); });

  it("interpreta a página no servidor e guarda as linhas", async () => {
    const resultado = await guardarPaginasRanked({
      format: "brawlhibrido-ranked-paginas-v1",
      maps: [pagina("15000007", "Hard Rock Mine", script(linha(16000000, "Shelly", 0.5137)))],
    });
    expect(resultado.mapas).toBe(1);
    expect(JSON.parse(db.guardados[0].payload)[0]).toMatchObject({ brawler: "Shelly", brawlerId: 16000000 });
  });

  /**
   * A regra que protege os dados de uma leitura vazia.
   *
   * Guardar uma página sem linhas apagaria a leitura boa anterior e passaria por
   * recolha feita. Um mapa a zeros é indistinguível de um mapa que ninguém
   * joga, e é assim que se tiram mapas da rotação por engano.
   */
  it("recusa uma página sem linhas em vez de guardar um mapa vazio", async () => {
    await expect(guardarPaginasRanked({
      format: "brawlhibrido-ranked-paginas-v1",
      maps: [pagina("15000010", "Gem Fort", "<p>sem dados nenhuns</p>")],
    })).rejects.toThrow("nenhuma linha reconhecida");
    expect(db.guardados).toHaveLength(0);
  });

  it("guarda as boas e diz quais recusou, sem deixar cair o lote", async () => {
    const resultado = await guardarPaginasRanked({
      format: "brawlhibrido-ranked-paginas-v1",
      maps: [
        pagina("15000007", "Hard Rock Mine", script(linha(1, "Bibi", 0.52))),
        pagina("15000010", "Gem Fort", "vazio"),
      ],
    });
    expect(resultado.mapas).toBe(1);
    expect(resultado.recusados).toEqual(["Gem Fort: nenhuma linha reconhecida"]);
  });

  /**
   * O problema que trouxe isto: a rotação mudou e o site continuou a pedir os
   * mapas antigos. A lista do projeto é escrita à mão, e o índice que diz quais
   * são os mapas de agora responde 403 ao alojamento — por isso a rotação nova
   * só podia entrar por aqui, pela leitura feita no navegador.
   */
  it("uma rotação nova entra e substitui a anterior", async () => {
    const antes = ["Hard Rock Mine", "Gem Fort", "Hideout", "Hot Potato", "Bridge Too Far", "Layer Cake",
      "Dry Season", "Double Swoosh", "Pinball Dreams", "Center Stage", "Open Business", "Parallel Plays",
      "Dueling Beetles", "Belle's Rock"];
    const depois = [...antes.slice(2), "Mapa Novo Um", "Mapa Novo Dois", "Mapa Novo Tres"];

    await guardarPaginasRanked({
      format: "brawlhibrido-ranked-paginas-v1",
      maps: [],
      rotation: { capturedAt: "2026-09-18T09:00:00.000Z", html: rotacaoDe(antes) },
    });
    const primeira = lerRotacaoGuardada(definicoes.guardadas.get(ROTACAO_GUARDADA_SETTING));
    expect(primeira?.maps.map((m) => m.name)).toContain("Hard Rock Mine");

    const segunda = await guardarPaginasRanked({
      format: "brawlhibrido-ranked-paginas-v1",
      maps: [],
      rotation: { capturedAt: "2026-09-18T10:00:00.000Z", html: rotacaoDe(depois) },
    });

    const guardada = lerRotacaoGuardada(definicoes.guardadas.get(ROTACAO_GUARDADA_SETTING));
    const nomes = guardada?.maps.map((m) => m.name) ?? [];
    // Os que entraram estão lá…
    expect(nomes).toContain("Mapa Novo Um");
    // …e os que saíram deixaram de estar. É esta segunda metade que faltava.
    expect(nomes).not.toContain("Hard Rock Mine");
    expect(segunda.rotacao?.mapas).toBe(depois.length);
    expect(guardada?.capturedAt).toBe("2026-09-18T10:00:00.000Z");
  });

  /**
   * Um parser partido lê zero mapas. Aceitar isso significaria concluir que a
   * rotação acabou, e apagar a boa por causa de uma mudança de formato.
   */
  it("uma leitura implausível não apaga a rotação guardada", async () => {
    const boa = ["Hard Rock Mine", "Gem Fort", "Hideout", "Hot Potato", "Bridge Too Far", "Layer Cake",
      "Dry Season", "Double Swoosh", "Pinball Dreams", "Center Stage", "Open Business", "Parallel Plays",
      "Dueling Beetles", "Belle's Rock"];
    await guardarPaginasRanked({
      format: "brawlhibrido-ranked-paginas-v1", maps: [],
      rotation: { capturedAt: "2026-09-18T09:00:00.000Z", html: rotacaoDe(boa) },
    });

    /**
     * Diz o que se passou, e aponta para o sítio certo.
     *
     * A primeira versão disto morria com "nenhuma página deu linhas
     * reconhecíveis" — uma mensagem sobre os mapas quando o problema estava no
     * índice, que manda procurar exatamente no lado errado.
     */
    await expect(guardarPaginasRanked({
      format: "brawlhibrido-ranked-paginas-v1", maps: [],
      rotation: { capturedAt: "2026-09-18T11:00:00.000Z", html: rotacaoDe(["Mapa Só Um", "Mapa Só Dois"]) },
    })).rejects.toThrow("a rotação anterior manteve-se");

    const guardada = lerRotacaoGuardada(definicoes.guardadas.get(ROTACAO_GUARDADA_SETTING));
    expect(guardada?.maps).toHaveLength(boa.length);
    expect(guardada?.capturedAt).toBe("2026-09-18T09:00:00.000Z");
  });

  /** Sem mapas nem rotação não há nada a importar, e dizê-lo é melhor que um 200 vazio. */
  it("recusa um ficheiro sem mapas e sem rotação", () => {
    const lido = rankedPaginasSchema.safeParse({ format: "brawlhibrido-ranked-paginas-v1", maps: [] });
    expect(lido.success).toBe(false);
  });

  it("recusa um id de mapa que não venha do endereço", () => {
    const lido = rankedPaginasSchema.safeParse({
      format: "brawlhibrido-ranked-paginas-v1",
      maps: [pagina("../etc/passwd", "Mapa", script(linha(1, "Nita", 0.5)))],
    });
    expect(lido.success).toBe(false);
  });
});
