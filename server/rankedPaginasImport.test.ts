import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ guardados: [] as { mapId: string; payload: string }[] }));
vi.mock("./db", () => ({
  upsertRankedMapCaptures: vi.fn(async (rows: { mapId: string; payload: string }[]) => { db.guardados.push(...rows); return rows.length; }),
}));
vi.mock("./arranque", () => ({ garantirArranque: vi.fn(async () => undefined) }));

import { guardarPaginasRanked, rankedPaginasSchema } from "./rankedImport";

const script = (linhas: string) => `self.__next_f.push([1,"{\\"maps\\":[{${linhas}}]}"])`;
const linha = (id: number, nome: string, win: number) =>
  `\\"brawlerId\\":${id},\\"brawlerName\\":\\"${nome}\\",\\"winRate\\":${win},\\"useRate\\":0.08,\\"effectivityRate\\":2.5`;

const pagina = (mapId: string, map: string, scripts: string) => ({
  mapId, map, capturedAt: "2026-09-17T12:00:00.000Z", scripts,
});

describe("mapas do TopBrawl trazidos pela extensão", () => {
  beforeEach(() => { db.guardados = []; });

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

  it("recusa um id de mapa que não venha do endereço", () => {
    const lido = rankedPaginasSchema.safeParse({
      format: "brawlhibrido-ranked-paginas-v1",
      maps: [pagina("../etc/passwd", "Mapa", script(linha(1, "Nita", 0.5)))],
    });
    expect(lido.success).toBe(false);
  });
});
