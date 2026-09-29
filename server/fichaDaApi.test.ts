import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JOGOS_MINIMOS_PARA_DESTAQUE, fichaDoBrawler } from "../shared/fichaDaApi";
import { resumirPartidas, type PartidaObservada } from "../shared/partidasObservadas";

/**
 * A Matriz 1v1 com a API ligada faz as contas do BrawlScope a partir das
 * partidas guardadas: quem countera o brawler, quem ele castiga, com quem joga
 * melhor (duplas e trios) e em que modo ganha.
 */

function repetir(vezes: number, partida: PartidaObservada) {
  return Array.from({ length: vezes }, () => partida);
}

const caca = (vencedores: string[], derrotados: string[]): PartidaObservada => ({ mapId: "15000100", mode: "bounty", vencedores, derrotados });
const nocaute = (vencedores: string[], derrotados: string[]): PartidaObservada => ({ mapId: "15000200", mode: "knockout", vencedores, derrotados });

const partidasDaCaca = [
  // Bolt ganha sempre ao Sprout, mas no resto só ganha metade.
  ...repetir(12, caca(["BOLT", "AMBER", "BEA"], ["SPROUT", "COLT", "DYNAMIKE"])),
  ...repetir(8, caca(["BOLT", "EMZ", "FRANK"], ["GENE", "HANK", "IZZY"])),
  ...repetir(20, caca(["GENE", "HANK", "IZZY"], ["BOLT", "EMZ", "FRANK"])),
  // O Sprout castiga o 8-Bit, que no resto ganha metade; e ganha sempre com a Wendy e o Colt.
  ...repetir(15, caca(["SPROUT", "WENDY", "COLT"], ["8-BIT", "JESSIE", "KIT"])),
  ...repetir(15, caca(["8-BIT", "JESSIE", "KIT"], ["LEON", "MAX", "NANI"])),
  // Uma só partida não chega para entrar nos destaques — nem com +75 pontos
  // (a Piper ganha 25% no resto e ganhou a única contra o Sprout).
  caca(["PIPER", "RICO", "SAM"], ["SPROUT", "TICK", "BYRON"]),
  ...repetir(3, caca(["GENE", "HANK", "IZZY"], ["PIPER", "RICO", "SAM"])),
];
const partidasDoNocaute = repetir(5, nocaute(["SPROUT", "CROW", "POCO"], ["LOU", "MEG", "OTIS"]));

const daCaca = resumirPartidas(partidasDaCaca);
const geral = resumirPartidas([...partidasDaCaca, ...partidasDoNocaute]);
const ficha = fichaDoBrawler(daCaca, "sprout", geral.brawlersPorModo);
const baseDoSprout = (15 / 28) * 100;

describe("ficha de um brawler a partir da API", () => {
  it("encontra o brawler sem olhar a maiúsculas e conta os jogos dele", () => {
    expect(ficha).toMatchObject({ brawler: "SPROUT", encontrado: true, jogos: 28, vitorias: 15, partidas: daCaca.partidas });
    expect(ficha.taxa).toBeCloseTo(baseDoSprout, 6);
    expect(ficha.uso).toBeCloseTo((28 / daCaca.partidas) * 100, 6);
  });

  it("counter: o adversário ganha acima do habitual dele contra o brawler", () => {
    expect(ficha.counters[0]).toMatchObject({ adversario: "BOLT", jogos: 12, vitoriasDoAdversario: 12, taxa: 100, habitual: 50, delta: 50 });
  });

  it("castiga: o adversário ganha abaixo do habitual dele contra o brawler", () => {
    // O 8-Bit, a Jessie e o Kit jogaram juntos: os três ficam empatados à cabeça.
    expect(ficha.castiga.slice(0, 3).map((linha) => linha.adversario).sort()).toEqual(["8-BIT", "JESSIE", "KIT"]);
    expect(ficha.castiga.find((linha) => linha.adversario === "8-BIT")).toMatchObject({ jogos: 15, taxa: 0, habitual: 50, delta: -50 });
    expect(ficha.castiga.every((linha) => (linha.delta ?? 0) < 0)).toBe(true);
    expect(ficha.counters.every((linha) => (linha.delta ?? 0) > 0)).toBe(true);
  });

  it("uma partida só aparece na lista completa, não nos destaques", () => {
    const piper = ficha.confrontos.find((linha) => linha.adversario === "PIPER");
    expect(piper).toMatchObject({ jogos: 1, taxa: 100, habitual: 25, delta: 75 });
    expect(ficha.counters.some((linha) => linha.jogos < JOGOS_MINIMOS_PARA_DESTAQUE)).toBe(false);
    expect(ficha.counters.map((linha) => linha.adversario)).not.toContain("PIPER");
  });

  it("duplas e trios comparam com a taxa habitual do próprio brawler", () => {
    expect(ficha.melhoresDuplas[0].aliados).toEqual(["WENDY"]);
    expect(ficha.melhoresDuplas[0].delta).toBeCloseTo(100 - baseDoSprout, 6);
    // O Colt jogou 12 derrotas e 15 vitórias com ele: fica perto da base.
    expect(ficha.duplas.find((linha) => linha.aliados[0] === "COLT")?.taxa).toBeCloseTo((15 / 27) * 100, 6);
    expect(ficha.melhoresTrios[0]).toMatchObject({ aliados: ["COLT", "WENDY"], jogos: 15, vitorias: 15 });
    expect(ficha.trios.find((linha) => linha.aliados.includes("DYNAMIKE"))).toMatchObject({ jogos: 12, vitorias: 0 });
  });

  it("onde ganha: cada modo com a taxa e a parte dos jogos, do melhor para o pior", () => {
    expect(ficha.porModo.map((modo) => modo.mode)).toEqual(["knockout", "bounty"]);
    expect(ficha.porModo[0]).toMatchObject({ nome: "Nocaute", jogos: 5, vitorias: 5, taxa: 100 });
    expect(ficha.porModo[0].parteDosJogos).toBeCloseTo((5 / 33) * 100, 6);
  });

  it("o resumo também conta cada brawler por mapa, pelo número do mapa", () => {
    expect(geral.brawlersPorMapa["15000200"].find((linha) => linha.brawler === "SPROUT")).toEqual({ brawler: "SPROUT", jogos: 5, vitorias: 5 });
    expect(geral.brawlersPorMapa["15000100"].find((linha) => linha.brawler === "SPROUT")).toEqual({ brawler: "SPROUT", jogos: 28, vitorias: 15 });
  });

  it("a ordem desconta as amostras pequenas: muitos jogos a +40 passam à frente de poucos a +50", () => {
    const resumo = {
      partidas: 100,
      brawlers: [
        { brawler: "X", jogos: 60, vitorias: 30 },
        { brawler: "POUCOS", jogos: 20, vitorias: 10 },
        { brawler: "MUITOS", jogos: 80, vitorias: 40 },
      ],
      confrontos: [
        { a: "POUCOS", b: "X", jogos: 10, vitorias: 10 },
        { a: "MUITOS", b: "X", jogos: 40, vitorias: 36 },
      ],
      sinergias: [],
      equipas: [],
    };
    const lida = fichaDoBrawler(resumo, "X");
    expect(lida.counters.map((linha) => [linha.adversario, linha.delta])).toEqual([["MUITOS", 40], ["POUCOS", 50]]);
  });

  it("um brawler sem partidas devolve uma ficha vazia, sem rebentar", () => {
    const vazia = fichaDoBrawler(daCaca, "NINGUEM", geral.brawlersPorModo);
    expect(vazia).toMatchObject({ encontrado: false, jogos: 0, taxa: null, uso: null, confrontos: [], duplas: [], trios: [], porModo: [] });
  });
});

describe("o endpoint da ficha", () => {
  const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  it("aceita os mesmos filtros da página Partidas e o nome do brawler", () => {
    const bloco = routers.slice(routers.indexOf("ficha: publicProcedure"), routers.indexOf(".query(({ input }) => fichaDaMatriz(input))"));
    expect(bloco).toContain("brawler: z.string().trim().min(1).max(40)");
    expect(bloco).toContain('rank: z.enum(["diamante", "mitico", "lendario", "mestre"]).optional()');
  });
});
