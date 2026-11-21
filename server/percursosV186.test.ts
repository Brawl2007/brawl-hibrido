import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allMapSummaries, allRankedRows, buildActiveRankedMapCatalog, normalizeRankedRows } from "@/data/rankedData";
import { atribuirDuelosPorCounter, buildScrimSequence, calculateLaneMatchup, inferDraftRole, posicionarNoMapa } from "@shared/draft";
import { getBrawlerAttackRangeBand } from "@shared/brawlerAttackRangeBands";
import { exemploDaRota, proximoPassoPendente, rotuloDoTurno, ultimoPassoResolvido, vezDaEquipa } from "@shared/turnoDoDraft";
import { resolverMapaDaRota } from "@shared/mapaNaRota";
import { JOGOS_MINIMOS_FIAVEIS, resumirPartidas } from "@shared/partidasObservadas";
import { PARTIDAS_DE_EXEMPLO, resumirPartidasDeExemplo, usarPartidasDeExemplo } from "./partidasDeExemplo";
import { escalaComumDeAlcance, filtrarPorTermos } from "@/lib/regressoAoCatalogo";
import { formatarDecimal, formatarPercentagemComSinal } from "@/lib/parametrosDaRota";

/**
 * v186 — os seis percursos de toque do kit de revisão.
 *
 * Os números de controlo vêm do motor e dos dados deste checkout; se mudarem,
 * é porque os dados mudaram, e as imagens do kit deixam de bater.
 */
const ler = (caminho: string) => readFileSync(resolve(import.meta.dirname, "..", caminho), "utf-8");

describe("o mapa atravessa as rotas", () => {
  const catalogo = buildActiveRankedMapCatalog(null, allRankedRows, allMapSummaries);

  it("Hard Rock Mine e Center Stage estão no catálogo ativo e resolvem pelo identificador", () => {
    expect(resolverMapaDaRota(catalogo, "hard-rock-mine").mapa?.name).toBe("Hard Rock Mine");
    expect(resolverMapaDaRota(catalogo, "center-stage").mapa?.name).toBe("Center Stage");
    expect(resolverMapaDaRota(catalogo, "pit-stop").estado).toBe("desconhecido");
  });

  it("o Início, o Draft e a ficha usam o endereço com o mapa e a intenção", () => {
    expect(ler("client/src/pages/Home.tsx")).toContain("enderecoDoDraft(selectedMap)");
    const draft = ler("client/src/pages/Draft.tsx");
    expect(draft).toContain('resolverMapaDaRota(liveMaps, lerParametro("map"))');
    expect(draft).toContain('lerParametro("brawler")');
    expect(ler("client/src/pages/BrawlerDetail.tsx")).toContain("enderecoDoDraft(null, item.brawler)");
  });
});

describe("pesos em Ring of Fire (fontes 50/50, Star Player desligado)", () => {
  const ordem = (vitoria: number) => normalizeRankedRows(allRankedRows.filter((linha) => linha.map === "Ring of Fire"), vitoria, 0.5, 0)
    .filter((linha) => typeof linha.score === "number")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.brawler.localeCompare(b.brawler));

  it.each([
    [0.7, 6, "71,24"],
    [0.85, 2, "85,62"],
    [0.95, 1, "95,21"],
  ])("Vitória %s: Draco em %s.º com %s", (vitoria, posicao, score) => {
    const linhas = ordem(vitoria);
    const draco = linhas.findIndex((linha) => linha.brawler === "Draco");
    expect(draco + 1).toBe(posicao);
    expect(formatarDecimal(linhas[draco].score)).toBe(score);
  });

  it("Hard Rock Mine só tem Score publicado: os pesos não mexem na ordem", () => {
    const hrm = allRankedRows.filter((linha) => linha.map === "Hard Rock Mine");
    expect(hrm.some((linha) => typeof linha.winRate === "number" && typeof linha.usage === "number")).toBe(false);
    const lider = (v: number) => normalizeRankedRows(hrm, v, 0.5, 0).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    expect(lider(0.7).brawler).toBe("Bolt");
    expect(formatarDecimal(lider(0.95).score)).toBe("73,18");
  });
});

describe("o turno do Draft", () => {
  const sequencia = buildScrimSequence("standard", "blue");
  const exemplo = exemploDaRota(sequencia, "Damian,Nori,Brock,Piper", ["Damian", "Nori", "Brock", "Piper", "Willow", "Sprout"])!;

  it("o exemplo começa no quinto pick, vez da equipa azul", () => {
    const passo = proximoPassoPendente(exemplo.escolhas, exemplo.ignorados);
    expect(rotuloDoTurno(sequencia, passo)).toBe("Pick 5 de 6");
    expect(vezDaEquipa(sequencia[passo!])).toBe("Vez da equipa azul");
  });

  it("Willow fecha a vaga azul e passa a vez à vermelha; desfazer devolve o quinto pick", () => {
    const quinto = proximoPassoPendente(exemplo.escolhas, exemplo.ignorados)!;
    const depois = exemplo.escolhas.map((nome, i) => (i === quinto ? "Willow" : nome));
    const sexto = proximoPassoPendente(depois, exemplo.ignorados);
    expect(rotuloDoTurno(sequencia, sexto)).toBe("Pick 6 de 6");
    expect(vezDaEquipa(sequencia[sexto!])).toBe("Vez da equipa vermelha");
    expect(ultimoPassoResolvido([...exemplo.historico, quinto], depois, exemplo.ignorados)).toBe(quinto);
  });

  it("desfazer salta passos já limpos e cai no resolvido mais avançado sem histórico", () => {
    const escolhas = ["A", null, "C", null];
    expect(ultimoPassoResolvido([0, 1], escolhas, [false, false, false, false])).toBe(0);
    expect(ultimoPassoResolvido([], escolhas, [false, false, false, false])).toBe(2);
    expect(ultimoPassoResolvido([], [null, null], [false, false])).toBeNull();
  });

  it("o exemplo no endereço ignora nomes fora do catálogo e repetidos", () => {
    expect(exemploDaRota(sequencia, "Ninguém", ["Willow"])).toBeNull();
    const repetido = exemploDaRota(sequencia, "Willow,willow", ["Willow"])!;
    expect(repetido.escolhas.filter(Boolean)).toEqual(["Willow"]);
  });

  it("um segundo toque no mesmo nome não é um segundo pick e desfazer cancela o voo", () => {
    const draft = ler("client/src/pages/Draft.tsx");
    expect(draft).toContain("lockedNames: new Set([...currentLockedNames, name])");
    expect(draft).toMatch(/const desfazer = \(\) => \{[\s\S]*cancelarVoo\(\);/);
  });
});

describe("o Quadro do General em Center Stage", () => {
  const linhas = normalizeRankedRows(allRankedRows.filter((linha) => linha.map === "Center Stage"));
  const de = (nome: string) => linhas.find((linha) => linha.brawler === nome)!;
  const duelos = posicionarNoMapa(atribuirDuelosPorCounter(["Damian", "Piper", "Willow"].map(de), ["Nori", "Brock", "Sprout"].map(de), "ally"), (d) => inferDraftRole(d.ally.brawler));

  it("a faixa direita é Willow × Sprout, 44,85/100 para a equipa azul, com a fonte", () => {
    const direita = duelos.find((d) => d.position === "right")!;
    expect([direita.item.ally.brawler, direita.item.enemy.brawler]).toEqual(["Willow", "Sprout"]);
    const confronto = calculateLaneMatchup(direita.item.ally, direita.item.enemy);
    expect(formatarDecimal(confronto.score)).toBe("44,85");
    expect(confronto.note).toBe("BrawlScope -5,15% (tabela geral)");
  });

  it("o índice aparece sempre com a equipa a que pertence, e há vista plana", () => {
    const quadro = ler("client/src/components/QuadroDoGeneral.tsx");
    expect(quadro).toContain("Índice da equipa {nosNome.toLowerCase()}");
    expect(quadro).toContain("<QuadroPlano");
    expect(ler("client/src/components/QuadroPlano.tsx")).toContain("caminhoLivre(terreno, de, para) ?? [de, para]");
  });
});

describe("alcance e o sinal dos confrontos", () => {
  it("Sprout, Willow e Angelo na mesma régua de 0 a 11 blocos", () => {
    const faixas = ["Sprout", "Willow", "Angelo"].map(getBrawlerAttackRangeBand);
    expect(faixas.map((f) => `${formatarDecimal(f!.minTiles, 1)}–${formatarDecimal(f!.maxTiles, 1)}`)).toEqual(["5,0–6,4", "6,5–7,9", "9,5–10,9"]);
    expect(escalaComumDeAlcance(faixas)).toBe(11);
    expect(escalaComumDeAlcance([null])).toBe(11);
    expect(["Sprout", "Willow", "Angelo", "Bull"].filter((nome) => filtrarPorTermos(nome, "Sprout, Willow, Angelo"))).toEqual(["Sprout", "Willow", "Angelo"]);
  });

  it("o valor vem do lado do adversário e o beneficiário é escrito por extenso", () => {
    const matriz = ler("client/src/pages/MatchupMatrix.tsx");
    expect(matriz).toContain("`${valor > 0 ? adversario : base} tem vantagem`");
    expect(formatarPercentagemComSinal(7.45)).toBe("+7,45%");
    expect(formatarPercentagemComSinal(-17.15)).toBe("−17,15%");
  });
});

describe("a amostra das Partidas", () => {
  it("as partidas de exemplo são as do teste e só existem em desenvolvimento sem base", () => {
    expect(PARTIDAS_DE_EXEMPLO).toHaveLength(3);
    expect(usarPartidasDeExemplo({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(true);
    expect(usarPartidasDeExemplo({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(usarPartidasDeExemplo({ NODE_ENV: "development", DATABASE_URL: "mysql://x" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("Bull, Colette e Lumi ganham duas e perdem uma; com 30+ jogos fica zero; sem filtro volta tudo", () => {
    const { resumo } = resumirPartidasDeExemplo({});
    const trio = resumo.equipas.find((e) => e.membros.join() === "Bull,Colette,Lumi")!;
    expect(trio).toMatchObject({ jogos: 3, vitorias: 2 });
    expect(resumo.confrontos.find((c) => c.a === "Lumi" && c.b === "Surge")).toMatchObject({ jogos: 3, vitorias: 2 });
    expect(resumo.sinergias.find((s) => s.a === "Bull" && s.b === "Colette")).toMatchObject({ jogos: 3, vitorias: 2 });
    expect(JOGOS_MINIMOS_FIAVEIS).toBe(30);
    expect(resumo.equipas.filter((e) => e.jogos >= JOGOS_MINIMOS_FIAVEIS)).toHaveLength(0);
    // Mesmo resultado que o motor a partir das mesmas partidas.
    expect(resumirPartidas(PARTIDAS_DE_EXEMPLO).equipas.find((e) => e.membros.join() === "Bull,Colette,Lumi")).toMatchObject({ jogos: 3, vitorias: 2 });
  });

  it("o filtro local conserva-se entre vistas e há um caminho para o limpar", () => {
    const pagina = ler("client/src/pages/Partidas.tsx");
    expect(pagina).toContain("Limpar filtro");
    expect(pagina).toContain('fiaveis: soFiaveis ? "1" : null');
  });
});

describe("a permissão de escrita continua no servidor", () => {
  it("«Corrigir terreno» só aparece ao dono com terreno lido", () => {
    expect(ler("client/src/components/QuadroDoGeneral.tsx")).toContain('item.id !== "casa" || (ehDono && terreno)');
  });
});
