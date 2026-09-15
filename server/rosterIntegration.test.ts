import { describe, expect, it } from "vitest";
import { normalizeSnapshotPayload, deriveMapSummaries, RANKED_MAP_SOURCES, describeMissingBrawlerData } from "./rankedSync";
import { mergeRotationSources, parseRankedRotationIndex } from "@shared/rankedRotationSource";
import { activeNames, evaluateRoster, quarantinedEntries, trackedNames } from "@shared/rosterDiscovery";
import { brawlerClassCatalog } from "@shared/draft";

describe("dados em falta num brawler novo", () => {
  it("não reclama de nada para um brawler que o projeto já conhece por inteiro", () => {
    expect(describeMissingBrawlerData("Shelly", 26)).toEqual([]);
    // O nome é comparado sem depender de maiúsculas.
    expect(describeMissingBrawlerData("shelly", 26)).toEqual([]);
  });

  it("enumera exatamente o que falta a um brawler acabado de lançar", () => {
    /**
     * No dia do lançamento a API oficial já o publica, mas o projeto não sabe a
     * classe (usada no desbónus de classe repetida) nem o alcance (usado no
     * bónus de abertura), e nenhuma fonte publicou estatísticas por mapa.
     */
    expect(describeMissingBrawlerData("Brawler Que Não Existe", 0))
      .toEqual(["classe oficial", "alcance de ataque", "dados por mapa"]);
  });

  it("vai riscando o que já chegou", () => {
    // Com dados por mapa mas ainda sem classe nem alcance no catálogo.
    expect(describeMissingBrawlerData("Brawler Que Não Existe", 12))
      .toEqual(["classe oficial", "alcance de ataque"]);
    // Um brawler com classe conhecida mas ainda sem linhas publicadas.
    const comClasse = Object.keys(brawlerClassCatalog)[0];
    expect(describeMissingBrawlerData(comClasse, 0)).toContain("dados por mapa");
    expect(describeMissingBrawlerData(comClasse, 0)).not.toContain("classe oficial");
  });
});

/**
 * Percurso completo de uma temporada: a rotação muda, o site descobre sozinho,
 * recolhe o mapa novo, e só o deixa participar quando ele tem dados.
 */
describe("uma mudança de temporada, do princípio ao fim", () => {
  const indice = (mapas: Array<[string, string, string]>) => `<!doctype html><html><body>${
    mapas.map(([nome, id, modo]) => `<h2>${modo}</h2><a href="/rankeds/${id}"><span>Map ${nome}</span></a>`).join("")
  }</body></html>`;

  const rotacaoAtual = RANKED_MAP_SOURCES.map(([nome, id, slug]): [string, string, string] => {
    const modo = slug.split("_")[1] ?? "knockout";
    const rotulo = { gemgrab: "GEM GRAB", heist: "HEIST", bounty: "BOUNTY", brawlball: "BRAWL BALL", hotzone: "HOT ZONE", knockout: "KNOCKOUT" }[modo] ?? "KNOCKOUT";
    return [nome, id, rotulo];
  });

  it("adota o mapa novo, recolhe-o, e só depois o deixa contar", () => {
    // Semana 0: rotação estável, tudo com dados.
    const semana0 = evaluateRoster(null, {
      maps: { present: RANKED_MAP_SOURCES.map(([nome]) => nome), complete: true },
      mapEvidence: RANKED_MAP_SOURCES.map(([nome]) => ({ name: nome, rows: 106 })),
      now: "2026-09-01T00:00:00.000Z",
    }).state;
    expect(activeNames(semana0.maps)).toHaveLength(26);

    // Semana 1: a Supercell troca um mapa. O índice publica a rotação nova.
    const novaRotacao = [...rotacaoAtual.filter(([nome]) => nome !== "New Horizons"), ["Mapa Estreante", "15009999", "KNOCKOUT"] as [string, string, string]];
    const leitura = parseRankedRotationIndex(indice(novaRotacao));
    const rotacao = mergeRotationSources(RANKED_MAP_SOURCES, leitura);

    expect(rotacao.complete).toBe(true);
    // O mapa novo já traz o id e o slug de que a recolha precisa — ninguém editou nada.
    expect(rotacao.maps.find((map) => map.name === "Mapa Estreante"))
      .toMatchObject({ id: "15009999", planetSlug: "mapaestreante_knockout" });

    // Nesta primeira sincronização as fontes ainda não publicaram nada do mapa novo.
    const semana1 = evaluateRoster(semana0, {
      maps: { present: rotacao.maps.map((map) => map.name), complete: true },
      mapEvidence: rotacao.maps.map((map) => ({ name: map.name, rows: map.name === "Mapa Estreante" ? 0 : 106 })),
      now: "2026-09-08T00:00:00.000Z",
    });

    expect(quarantinedEntries(semana1.state.maps).map((entry) => entry.name)).toEqual(["Mapa Estreante"]);
    expect(activeNames(semana1.state.maps)).not.toContain("Mapa Estreante");
    // Continua a ser recolhido — é assim que consegue os dados que lhe faltam.
    expect(trackedNames(semana1.state.maps)).toContain("Mapa Estreante");
    // O mapa que saiu ainda não foi removido: falta a segunda leitura completa.
    expect(activeNames(semana1.state.maps)).toContain("New Horizons");

    // Semana 2: as fontes publicam o mapa novo e confirmam a saída do antigo.
    const semana2 = evaluateRoster(semana1.state, {
      maps: { present: rotacao.maps.map((map) => map.name), complete: true },
      mapEvidence: rotacao.maps.map((map) => ({ name: map.name, rows: 106 })),
      now: "2026-09-15T00:00:00.000Z",
    });

    expect(activeNames(semana2.state.maps)).toContain("Mapa Estreante");
    expect(semana2.state.maps.map((entry) => entry.name)).not.toContain("New Horizons");
    expect(activeNames(semana2.state.maps)).toHaveLength(26);
  });

  it("uma falha do índice a meio da transição não desfaz nem apressa nada", () => {
    const estavel = evaluateRoster(null, {
      maps: { present: RANKED_MAP_SOURCES.map(([nome]) => nome), complete: true },
      mapEvidence: RANKED_MAP_SOURCES.map(([nome]) => ({ name: nome, rows: 106 })),
      now: "2026-09-01T00:00:00.000Z",
    }).state;

    // O índice devolve uma página de manutenção: a junção cai para a lista do
    // projeto e marca a leitura como incompleta.
    const rotacao = mergeRotationSources(RANKED_MAP_SOURCES, parseRankedRotationIndex("<html><body>manutenção</body></html>"));
    expect(rotacao.complete).toBe(false);
    expect(rotacao.maps).toHaveLength(26);

    const depois = evaluateRoster(estavel, {
      maps: { present: rotacao.maps.map((map) => map.name), complete: rotacao.complete },
      mapEvidence: rotacao.maps.map((map) => ({ name: map.name, rows: 106 })),
      now: "2026-09-02T00:00:00.000Z",
    });

    expect(activeNames(depois.state.maps)).toHaveLength(26);
    expect(depois.changes).toEqual([]);
  });

  it("uma recolha parcial não conta como prova de que um mapa saiu", () => {
    /**
     * O índice pode ler-se bem e a recolha por mapa falhar à mesma — o TopBrawl
     * em baixo, por exemplo. Nessa situação a sincronização marca a leitura como
     * incompleta, e é isso que impede uma remoção indevida.
     */
    const estavel = evaluateRoster(null, {
      maps: { present: RANKED_MAP_SOURCES.map(([nome]) => nome), complete: true },
      mapEvidence: RANKED_MAP_SOURCES.map(([nome]) => ({ name: nome, rows: 106 })),
      now: "2026-09-01T00:00:00.000Z",
    }).state;

    const semUmMapa = RANKED_MAP_SOURCES.map(([nome]) => nome).filter((nome) => nome !== "Gem Fort");
    const depois = evaluateRoster(estavel, {
      maps: { present: semUmMapa, complete: false },
      mapEvidence: semUmMapa.map((nome) => ({ name: nome, rows: 106 })),
      now: "2026-09-02T00:00:00.000Z",
    });

    expect(activeNames(depois.state.maps)).toContain("Gem Fort");
    expect(depois.state.maps.find((entry) => entry.name === "Gem Fort")?.absenceStreak).toBe(0);
  });
});


it("keeps new maps and brawlers through reload while excluding departed maps", () => {
  const rows = [
    { map: "Mapa Novo", mode: "Nocaute", modeId: "knockout", brawler: "Brawler Novo", score: 55, winRate: 55, usage: 3, tier: "A" as const },
    { map: "Beach Ball", mode: "Fute-Brawl", modeId: "brawl-ball", brawler: "Shelly", score: 50, tier: "B" as const },
  ];
  const roster = evaluateRoster(undefined, {
    maps: { present: ["Mapa Novo"], complete: true },
    mapEvidence: [{ name: "Mapa Novo", rows: 106 }],
    now: "2026-09-14T12:00:00Z",
  }).state;
  const payload = normalizeSnapshotPayload({ rows, maps: deriveMapSummaries(rows), mapTeams: [], roster, updatedAt: "2026-09-14T12:00:00Z", sourceStatus: { topBrawl: "success", brawlPlanet: "success" } });
  expect(payload.maps.map(map => map.name)).toEqual(["Mapa Novo"]);
  expect(payload.rows.map(row => row.brawler)).toEqual(["Brawler Novo"]);
});
