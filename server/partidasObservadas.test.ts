import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JOGOS_MINIMOS_FIAVEIS, nomeDoModo, resumirPartidas, taxaDeUso, taxaDeVitoria } from "@shared/partidasObservadas";

/**
 * v156 — página «Partidas». Tudo a partir das partidas Ranked recolhidas:
 * cada brawler, cada 1 contra 1, cada equipa de três e cada par de aliados.
 */
const partida = (vencedores: string[], derrotados: string[], mapId = "15000350", mode = "hotzone") => ({ mapId, mode, vencedores, derrotados });

describe("contas das partidas", () => {
  const partidas = [
    partida(["Bull", "Colette", "Lumi"], ["Surge", "Emz", "Griff"]),
    partida(["Surge", "Emz", "Griff"], ["Bull", "Colette", "Lumi"]),
    partida(["Lumi", "Bull", "Colette"], ["Surge", "Emz", "Gus"]),
  ];
  const resumo = resumirPartidas(partidas);

  it("conta cada brawler: jogos, vitórias e uso", () => {
    expect(resumo.partidas).toBe(3);
    const lumi = resumo.brawlers.find((linha) => linha.brawler === "Lumi")!;
    expect(lumi).toMatchObject({ jogos: 3, vitorias: 2 });
    expect(taxaDeVitoria(lumi)).toBeCloseTo(66.67, 1);
    expect(taxaDeUso(lumi.jogos, resumo.partidas)).toBe(100);
    expect(resumo.brawlers.find((linha) => linha.brawler === "Gus")).toMatchObject({ jogos: 1, vitorias: 0 });
  });

  it("conta cada confronto 1 contra 1 nos dois sentidos, sem cortes", () => {
    const lumiSurge = resumo.confrontos.find((c) => c.a === "Lumi" && c.b === "Surge")!;
    const surgeLumi = resumo.confrontos.find((c) => c.a === "Surge" && c.b === "Lumi")!;
    expect(lumiSurge).toMatchObject({ jogos: 3, vitorias: 2 });
    expect(surgeLumi).toMatchObject({ jogos: 3, vitorias: 1 });
    // 3 partidas × 2 lados × 3 × 3 pares, menos os que se repetem.
    const distintos = new Set(resumo.confrontos.map((c) => `${c.a}>${c.b}`));
    expect(distintos.size).toBe(resumo.confrontos.length);
    expect(resumo.confrontos.every((c) => c.a !== c.b)).toBe(true);
  });

  it("junta a mesma equipa escrita por outra ordem", () => {
    const trio = resumo.equipas.find((e) => e.membros.join() === "Bull,Colette,Lumi")!;
    expect(trio).toMatchObject({ jogos: 3, vitorias: 2 });
    expect(resumo.equipas).toHaveLength(3);
  });

  it("conta os pares de aliados uma vez por equipa", () => {
    expect(resumo.sinergias.find((s) => s.a === "Bull" && s.b === "Lumi")).toMatchObject({ jogos: 3, vitorias: 2 });
    expect(resumo.sinergias.find((s) => s.a === "Emz" && s.b === "Surge")).toMatchObject({ jogos: 3, vitorias: 1 });
    expect(resumo.sinergias.every((s) => s.a < s.b)).toBe(true);
  });

  it("sem partidas não inventa números", () => {
    expect(resumirPartidas([])).toEqual({ partidas: 0, brawlers: [], confrontos: [], equipas: [], sinergias: [] });
    expect(taxaDeVitoria({ jogos: 0, vitorias: 0 })).toBeNull();
    expect(taxaDeUso(0, 0)).toBeNull();
  });

  it("modos com o nome do site e aviso de amostra pequena", () => {
    expect(nomeDoModo("hotzone")).toBe("Zona Estratégica");
    expect(nomeDoModo("knockout")).toBe("Nocaute");
    expect(nomeDoModo("novo")).toBe("novo");
    expect(JOGOS_MINIMOS_FIAVEIS).toBe(30);
  });
});

describe("a página e o pedido", () => {
  const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf8");

  it("o pedido lê as partidas guardadas e devolve tudo, com os nomes dos mapas", () => {
    expect(ler("server/routers.ts")).toContain("partidas: publicProcedure");
    const resumo = ler("server/partidasResumo.ts");
    expect(resumo).toContain("listObservedBattlesParaResumo(");
    expect(resumo).toContain("lerNomesDosMapas()");
    expect(ler("server/observedMatchCollection.ts")).toContain("guardarNomesDosMapas(");
  });

  it("a página tem os quatro separadores, período, modo, mapa e mostra tudo", () => {
    const pagina = ler("client/src/pages/Partidas.tsx");
    for (const texto of ['"Brawlers"', '"1 contra 1"', '"Equipas 3v3"', '"Sinergias"', "Todos os modos", "Todos os mapas", "<SeletorDePeriodo"]) expect(pagina).toContain(texto);
    // Nada cortado: as listas abrem aos cem, com «Mostrar mais» até ao fim.
    expect(pagina).toContain("Mostrar mais");
    expect(pagina).not.toMatch(/\.slice\(0, (1|3|5|10)\)/);
    expect(ler("client/src/App.tsx")).toContain('<Route path="/partidas" component={Partidas} />');
  });
});

describe("período à escolha (v158)", () => {
  const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf8");

  it("atalhos de 24 h, 7, 14 e 30 dias, tudo, e os dias que se escreverem", async () => {
    const seletor = ler("client/src/components/SeletorDePeriodo.tsx");
    for (const texto of ['"24 h"', '"7 dias"', '"14 dias"', '"30 dias"', '"Tudo"', 'aria-label="Número de dias"']) expect(seletor).toContain(texto);
    const { limitarDias } = await import("../client/src/components/SeletorDePeriodo");
    expect(limitarDias(21)).toBe(21);
    expect(limitarDias(9999)).toBe(365);
    expect(limitarDias(-3)).toBe(0);
    expect(limitarDias(Number.NaN)).toBe(30);
  });

  it("o servidor aceita qualquer número de dias e o Draft usa o mesmo controlo", () => {
    expect(ler("server/routers.ts")).toContain("dias: z.number().int().min(0).max(3650).default(30)");
    const draft = ler("client/src/pages/Draft.tsx");
    expect(draft).toContain("<SeletorDePeriodo className=\"mesa-fonte-api-periodo\" dias={fonteApi.dias} onChange={fonteApi.setDias} />");
    expect(ler("client/src/hooks/useFonteApi.ts")).toContain("{ dias, mapId: mapa?.mapId }");
  });
});
