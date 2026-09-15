import { describe, expect, it } from "vitest";
import {
  MAP_PROMOTION_MIN_ROWS,
  ROSTER_REMOVAL_STREAK,
  activeNames,
  describeRosterChanges,
  evaluateRoster,
  leavingEntries,
  quarantinedEntries,
  trackedNames,
  type RosterState,
} from "@shared/rosterDiscovery";

const t = (n: number) => `2026-09-${String(10 + n).padStart(2, "0")}T00:00:00.000Z`;

/** Leitura completa com dados suficientes para cada mapa indicado. */
function leituraCompleta(mapas: string[], linhas = MAP_PROMOTION_MIN_ROWS) {
  return {
    maps: { present: mapas, complete: true },
    mapEvidence: mapas.map((name) => ({ name, rows: linhas })),
  };
}

function estadoCom(mapas: string[], now: string): RosterState {
  return evaluateRoster(null, { ...leituraCompleta(mapas), now }).state;
}

describe("deteção de entradas e saídas no roster", () => {
  it("adota um mapa novo assim que a fonte o publica com dados", () => {
    const inicial = estadoCom(["Gem Fort", "Hideout"], t(0));
    const depois = evaluateRoster(inicial, { ...leituraCompleta(["Gem Fort", "Hideout", "Beach Ball"]), now: t(1) });

    expect(activeNames(depois.state.maps)).toContain("Beach Ball");
    expect(depois.changes).toContainEqual(expect.objectContaining({ name: "Beach Ball", change: "entered" }));
  });

  it("põe em quarentena um mapa que ainda não tem estatísticas publicadas", () => {
    // O caso real: o mapa entra na rotação hoje e as fontes só publicam
    // estatísticas dele dias depois. Entra visível, mas não recomenda nada.
    const inicial = estadoCom(["Gem Fort"], t(0));
    const depois = evaluateRoster(inicial, {
      maps: { present: ["Gem Fort", "Mapa Estreante"], complete: true },
      mapEvidence: [{ name: "Gem Fort", rows: 106 }, { name: "Mapa Estreante", rows: 0 }],
      now: t(1),
    });

    expect(quarantinedEntries(depois.state.maps).map((entry) => entry.name)).toEqual(["Mapa Estreante"]);
    expect(activeNames(depois.state.maps)).not.toContain("Mapa Estreante");
    // Continua a ser recolhido — é assim que ganha os dados que lhe faltam.
    expect(trackedNames(depois.state.maps)).toContain("Mapa Estreante");
    expect(quarantinedEntries(depois.state.maps)[0].missing).toEqual(["estatísticas publicadas"]);
  });

  it("promove sozinho quando os dados aparecem, sem intervenção", () => {
    const dia0 = evaluateRoster(null, {
      maps: { present: ["Mapa Estreante"], complete: true },
      mapEvidence: [{ name: "Mapa Estreante", rows: 0 }],
      now: t(0),
    }).state;
    const dia1 = evaluateRoster(dia0, {
      maps: { present: ["Mapa Estreante"], complete: true },
      mapEvidence: [{ name: "Mapa Estreante", rows: MAP_PROMOTION_MIN_ROWS }],
      now: t(1),
    });

    expect(dia1.state.maps[0].status).toBe("active");
    expect(dia1.state.maps[0].promotedAt).toBe(t(1));
    expect(dia1.state.maps[0].missing).toBeUndefined();
    expect(dia1.changes).toContainEqual(expect.objectContaining({ name: "Mapa Estreante", change: "promoted" }));
  });

  it("não promove com dados a menos do que o mínimo", () => {
    const dia0 = evaluateRoster(null, {
      maps: { present: ["Meio Mapa"], complete: true },
      mapEvidence: [{ name: "Meio Mapa", rows: 0 }],
      now: t(0),
    }).state;
    const dia1 = evaluateRoster(dia0, {
      maps: { present: ["Meio Mapa"], complete: true },
      mapEvidence: [{ name: "Meio Mapa", rows: MAP_PROMOTION_MIN_ROWS - 1 }],
      now: t(1),
    });

    expect(dia1.state.maps[0].status).toBe("quarantine");
  });

  it("exige duas leituras completas antes de remover um mapa", () => {
    const inicial = estadoCom(["Gem Fort", "Pit Stop"], t(0));

    const primeira = evaluateRoster(inicial, { ...leituraCompleta(["Gem Fort"]), now: t(1) });
    expect(leavingEntries(primeira.state.maps).map((entry) => entry.name)).toEqual(["Pit Stop"]);
    // Ainda conta para recomendações: sair da rotação não é o mesmo que não existir.
    expect(activeNames(primeira.state.maps)).toContain("Pit Stop");
    expect(primeira.changes).toContainEqual(expect.objectContaining({ name: "Pit Stop", change: "leaving" }));

    const segunda = evaluateRoster(primeira.state, { ...leituraCompleta(["Gem Fort"]), now: t(2) });
    expect(segunda.state.maps.map((entry) => entry.name)).toEqual(["Gem Fort"]);
    expect(segunda.changes).toContainEqual(expect.objectContaining({ name: "Pit Stop", change: "removed" }));
    expect(ROSTER_REMOVAL_STREAK).toBe(2);
  });

  it("nunca deixa uma leitura incompleta apagar a rotação", () => {
    /**
     * É o cenário que mais importa: o TopBrawl não responde e a recolha vem
     * vazia. Um sistema ingénuo concluía "saíram 26 mapas". Aqui não se mexe em
     * nada — e mesmo repetido muitas vezes continua a não mexer.
     */
    const inicial = estadoCom(["Gem Fort", "Hideout", "Beach Ball"], t(0));
    let estado = inicial;
    for (let tentativa = 0; tentativa < 20; tentativa += 1) {
      estado = evaluateRoster(estado, { maps: { present: [], complete: false }, now: t(1) }).state;
    }

    expect(estado.maps.map((entry) => entry.name)).toEqual(["Beach Ball", "Gem Fort", "Hideout"]);
    expect(estado.maps.every((entry) => entry.absenceStreak === 0)).toBe(true);
    expect(activeNames(estado.maps)).toHaveLength(3);
  });

  it("reinicia a contagem quando o mapa volta a aparecer", () => {
    const inicial = estadoCom(["Gem Fort", "Hideout"], t(0));
    const aSair = evaluateRoster(inicial, { ...leituraCompleta(["Gem Fort"]), now: t(1) });
    const voltou = evaluateRoster(aSair.state, { ...leituraCompleta(["Gem Fort", "Hideout"]), now: t(2) });

    const hideout = voltou.state.maps.find((entry) => entry.name === "Hideout");
    expect(hideout?.status).toBe("active");
    expect(hideout?.absenceStreak).toBe(0);
    expect(voltou.changes).toContainEqual(expect.objectContaining({ name: "Hideout", change: "returned" }));

    // E a partir daqui voltam a ser precisas duas leituras completas.
    const outraVez = evaluateRoster(voltou.state, { ...leituraCompleta(["Gem Fort"]), now: t(3) });
    expect(outraVez.state.maps.map((entry) => entry.name)).toContain("Hideout");
  });

  it("preserva a data em que cada entrada foi vista pela primeira vez", () => {
    const inicial = estadoCom(["Gem Fort"], t(0));
    const depois = evaluateRoster(inicial, { ...leituraCompleta(["Gem Fort"]), now: t(5) });

    expect(depois.state.maps[0].firstSeenAt).toBe(t(0));
    expect(depois.state.maps[0].lastSeenAt).toBe(t(5));
  });

  it("trata os nomes sem depender de maiúsculas ou espaços", () => {
    const inicial = estadoCom(["Gem Fort"], t(0));
    const depois = evaluateRoster(inicial, {
      maps: { present: ["  gem fort  "], complete: true },
      mapEvidence: [{ name: "gem fort", rows: 106 }],
      now: t(1),
    });

    expect(depois.state.maps).toHaveLength(1);
    expect(depois.changes.filter((change) => change.change === "entered")).toEqual([]);
  });

  it("adota um brawler novo do catálogo oficial e espera pelos dados dele", () => {
    const dia0 = evaluateRoster(null, {
      brawlers: { present: ["Shelly", "Colt"], complete: true },
      brawlerEvidence: [{ name: "Shelly", rows: 26 }, { name: "Colt", rows: 26 }],
      now: t(0),
    }).state;

    const lancamento = evaluateRoster(dia0, {
      brawlers: { present: ["Shelly", "Colt", "Brawler Novo"], complete: true },
      brawlerEvidence: [
        { name: "Shelly", rows: 26 },
        { name: "Colt", rows: 26 },
        { name: "Brawler Novo", rows: 0, missing: ["classe oficial", "alcance de ataque", "dados por mapa"] },
      ],
      now: t(1),
    });

    const novo = quarantinedEntries(lancamento.state.brawlers);
    expect(novo.map((entry) => entry.name)).toEqual(["Brawler Novo"]);
    expect(novo[0].missing).toEqual(["classe oficial", "alcance de ataque", "dados por mapa"]);
    expect(activeNames(lancamento.state.brawlers)).not.toContain("Brawler Novo");

    // Quando a classe e os dados chegam, entra sozinho.
    const completo = evaluateRoster(lancamento.state, {
      brawlers: { present: ["Shelly", "Colt", "Brawler Novo"], complete: true },
      brawlerEvidence: [
        { name: "Shelly", rows: 26 },
        { name: "Colt", rows: 26 },
        { name: "Brawler Novo", rows: 12, missing: [] },
      ],
      now: t(2),
    });
    expect(activeNames(completo.state.brawlers)).toContain("Brawler Novo");
  });

  it("não mexe numa secção que não recebeu leitura", () => {
    const inicial = evaluateRoster(null, {
      ...leituraCompleta(["Gem Fort"]),
      brawlers: { present: ["Shelly"], complete: true },
      brawlerEvidence: [{ name: "Shelly", rows: 26 }],
      now: t(0),
    }).state;

    // A API oficial pode estar sem chave: nesse caso não há leitura de brawlers,
    // e isso não pode significar que todos os brawlers desapareceram.
    const semBrawlers = evaluateRoster(inicial, { ...leituraCompleta(["Gem Fort"]), now: t(1) });
    expect(semBrawlers.state.brawlers.map((entry) => entry.name)).toEqual(["Shelly"]);
    expect(semBrawlers.state.brawlers[0].absenceStreak).toBe(0);
  });

  it("resume as novidades em linguagem corrente, e cala-se quando não há nada", () => {
    const estavel = estadoCom(["Gem Fort"], t(0));
    expect(describeRosterChanges(estavel)).toBeNull();

    const comNovidades = evaluateRoster(estavel, {
      maps: { present: ["Gem Fort", "Mapa Estreante"], complete: true },
      mapEvidence: [{ name: "Gem Fort", rows: 106 }, { name: "Mapa Estreante", rows: 0 }],
      now: t(1),
    }).state;
    expect(describeRosterChanges(comNovidades)).toBe("1 novidade a recolher dados");

    const comSaida = evaluateRoster(comNovidades, {
      maps: { present: ["Mapa Estreante"], complete: true },
      mapEvidence: [{ name: "Mapa Estreante", rows: 0 }],
      now: t(2),
    }).state;
    expect(describeRosterChanges(comSaida)).toBe("1 novidade a recolher dados · 1 a sair da rotação");
  });
});
