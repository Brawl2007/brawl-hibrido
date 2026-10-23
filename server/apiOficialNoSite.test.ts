import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fichaDasFontes } from "../shared/fichaDasFontes";
import { linhasDaApi, linhasDosMapasDaApi } from "../client/src/hooks/useFonteApi";

/**
 * v161 — um só botão «API oficial» para o site todo, e os números a baterem
 * de página para página.
 */
const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), "utf8");

describe("um só interruptor, um só período e um só rank", () => {
  const estado = ler("client/src/hooks/useApiOficial.ts");

  it("guarda ligado, dias e rank nas mesmas chaves para todas as páginas", () => {
    // As chaves do antigo «Só API oficial» do Draft: quem já o tinha ligado não o perde.
    expect(estado).toContain('const CHAVE = "draft-so-api-oficial";');
    expect(estado).toContain('const CHAVE_DOS_DIAS = "draft-so-api-oficial-dias";');
    expect(estado).toContain('const CHAVE_DO_RANK = "api-oficial-rank";');
    expect(estado).toContain("useSyncExternalStore(subscrever, ler, ler)");
  });

  it("Draft, Mapas, Matriz e Partidas usam esse estado", () => {
    expect(ler("client/src/hooks/useFonteApi.ts")).toContain("useApiOficial()");
    expect(ler("client/src/pages/Draft.tsx")).toContain("<SeletorDeRank className=\"mesa-fonte-api-rank\" rank={fonteApi.rank} onChange={fonteApi.setRank} />");
    const inicio = ler("client/src/pages/Home.tsx");
    expect(inicio).toContain("<BotaoApiOficial ligada={api.ligada} onAlternar={api.alternar} />");
    expect(inicio).toContain("linhasDosMapasDaApi(mapDisplayRows, fonteApi.geral)");
    const matriz = ler("client/src/pages/MatchupMatrix.tsx");
    expect(matriz).toContain("<BotaoApiOficial ligada={api.ligada} onAlternar={api.alternar} />");
    expect(matriz).toContain("trpc.observedMatches.ficha.useQuery(");
    expect(matriz).toContain("rank: api.rank || undefined");
    const partidas = ler("client/src/pages/Partidas.tsx");
    expect(partidas).toContain("const { dias, setDias, rank, setRank } = useApiOficial();");
    expect(partidas).not.toContain("useState<number>(30)");
  });

  it("as consultas do Draft levam o rank escolhido", () => {
    const fonte = ler("client/src/hooks/useFonteApi.ts");
    expect(fonte).toContain("useQuery({ dias, rank: doRank }");
    expect(fonte).toContain("{ dias, rank: doRank, mapId: mapa?.mapId }");
  });
});

describe("o Draft mostra a vitória medida (a mesma das Partidas)", () => {
  const resumo = { partidas: 67, brawlers: [{ brawler: "BROCK", jogos: 33, vitorias: 20 }], confrontos: [], sinergias: [] };

  it("guarda a vitória medida e os jogos, além da ajustada que ordena", () => {
    const [brock] = linhasDaApi([{ brawler: "Brock" }], resumo);
    expect(brock.vitoriaNaApi).toBeCloseTo((20 / 33) * 100, 6); // 60,61% — o número da página Partidas
    expect(brock.jogosNaApi).toBe(33);
    expect(brock.usage).toBeCloseTo((33 / 67) * 100, 6); // 49,25%
    expect(brock.winRate).toBeCloseTo(brock.vitoriaNaApi!, 6); // a amostra do próprio mapa sustenta a força; não se importa o neutro do modo
  });

  it("o cartão do Draft escreve a medida e os jogos quando a API está ligada", () => {
    const draft = ler("client/src/pages/Draft.tsx");
    expect(draft).toContain("Vitória {formatMetric(daApi ? daApi.vitoria : roleWinRate)}");
    expect(draft).toContain("${daApi.jogos} jogos");
  });

  it("sem partidas, a vitória medida fica vazia em vez de inventar 50%", () => {
    const [ninguem] = linhasDaApi([{ brawler: "Ninguem" }], resumo);
    expect(ninguem.vitoriaNaApi).toBeNull();
    expect(ninguem.jogosNaApi).toBe(0);
  });
});

describe("Mapas com a API ligada", () => {
  it("cada mapa recebe as partidas dele, pelo nome do mapa", () => {
    const geral = {
      mapas: [{ mapId: "1", nome: "Belle's Rock", partidas: 67 }, { mapId: "2", nome: "New Horizons", partidas: 47 }],
      brawlersPorMapa: {
        "1": [{ brawler: "BROCK", jogos: 33, vitorias: 20 }],
        "2": [{ brawler: "BROCK", jogos: 10, vitorias: 2 }],
      },
    };
    const linhas = linhasDosMapasDaApi([
      { brawler: "Brock", map: "Belle’s Rock" },
      { brawler: "Brock", map: "New Horizons" },
      { brawler: "Brock", map: "Mapa sem partidas" },
    ], geral);
    expect(linhas.map((linha) => [linha.map, linha.jogosNaApi, linha.usage])).toEqual([
      ["Belle’s Rock", 33, (33 / 67) * 100],
      ["New Horizons", 10, (10 / 47) * 100],
      ["Mapa sem partidas", 0, 0],
    ]);
  });
});

describe("Matriz 1v1 pelas fontes (API desligada)", () => {
  it("lê cada confronto do lado do adversário: counters positivos, castigados negativos, sem ele próprio", async () => {
    const { getMatchupValue } = await import("../shared/counterMatchupValue");
    const ficha = fichaDasFontes("Colt", ["Colt", "Shelly", "Bull", "Piper", "Mortis", "Edgar", "Bea"]);
    expect(ficha.confrontos.map((linha) => linha.adversario)).not.toContain("Colt");
    for (const linha of ficha.confrontos) {
      const valor = getMatchupValue(linha.adversario, "Colt");
      expect(linha.valor).toBe(valor.base === null ? 0 : valor.total);
    }
    expect(ficha.counters.every((linha) => linha.valor > 0)).toBe(true);
    expect(ficha.castiga.every((linha) => linha.valor < 0)).toBe(true);
    // Ordenados: o counter mais forte primeiro, o mais castigado primeiro.
    expect(ficha.counters.map((linha) => linha.valor)).toEqual([...ficha.counters.map((linha) => linha.valor)].sort((a, b) => b - a));
    expect(ficha.castiga.map((linha) => linha.valor)).toEqual([...ficha.castiga.map((linha) => linha.valor)].sort((a, b) => a - b));
    expect(ficha.counters.length + ficha.castiga.length).toBeGreaterThan(0);
  });
});

describe("Matriz 1v1: qualquer brawler, sempre à vista (v163)", () => {
  const matriz = ler("client/src/pages/MatchupMatrix.tsx");
  it("a faixa com todos os brawlers e a procura estão sempre na página, não escondidas atrás de um botão", () => {
    expect(matriz).toContain('<div className="matriz-faixa" ref={faixaRef} role="listbox" aria-label="Brawlers">');
    expect(matriz).toContain("{nomesParaEscolher.map((opcao) => {");
    expect(matriz).toContain('aria-label="Procurar brawler"');
    expect(matriz).not.toContain("escolherAberto ?");
  });
  it("o brawler escolhido vem do endereço (?b=) ou fica guardado; o Sprout é só o primeiro da primeira visita", () => {
    expect(matriz).toContain('new URLSearchParams(window.location.search).get("b") || localStorage.getItem("matriz-brawler") || "Sprout"');
    expect(matriz).toContain('localStorage.setItem("matriz-brawler", brawler);');
  });
});
