import { describe, expect, it } from "vitest";
import { afterEach } from "vitest";
import { getSnapshotSynergies, type CounterSyncSnapshotPayload } from "@shared/counterSyncSnapshot";
import { getCounterSourceProfiles, setCounterSyncSnapshot } from "@shared/counterSourceRelations";

const estado = { status: "success" as const, complete: true, fetchedAt: "2026-09-17T00:00:00Z", brawlers: [], relationCount: 0 };

/** Snapshot com sinergia só na leitura geral, sem nenhuma por modo. */
function snapshotSoComGeral(source: "brawlscope" | "planet"): CounterSyncSnapshotPayload {
  return {
    schemaVersion: 2,
    capturedAt: estado.fetchedAt,
    absenceStreaks: {},
    sourceStates: { brawlscope: estado, calculator: estado, planet: estado, prodigy: estado },
    relations: [],
    synergies: [
      { owner: "Bolt", teammate: "Ash", source, sourceUrl: "https://exemplo.test/bolt", rank: 1 },
      { owner: "Bolt", teammate: "Fang", source, sourceUrl: "https://exemplo.test/bolt", rank: 2 },
    ],
  };
}

describe("sinergia pedida por modo", () => {
  /**
   * O contrato está escrito na própria função: "um `modeId` pedido usa as
   * leituras desse modo e só recorre à leitura global quando o modo não
   * publicou nenhuma lista para o titular".
   *
   * A recolha do BrawlScope lê uma vista por ciclo, das sete que existem. Até a
   * vista de um modo entrar, esse modo não tem lista nenhuma — e é exatamente o
   * caso que a regra prevê.
   */
  it("recorre à leitura geral quando o modo ainda não publicou lista", () => {
    const aliados = getSnapshotSynergies(snapshotSoComGeral("brawlscope"), "Bolt", "brawlscope", "hotZone");
    expect(aliados.map((entry) => entry.teammate)).toEqual(["Ash", "Fang"]);
  });

  it("faz o mesmo para o Brawl Planet", () => {
    const aliados = getSnapshotSynergies(snapshotSoComGeral("planet"), "Bolt", "planet", "hotZone");
    expect(aliados.map((entry) => entry.teammate)).toEqual(["Ash", "Fang"]);
  });

  it("a lista do modo, quando existe, continua a mandar", () => {
    const snapshot = snapshotSoComGeral("brawlscope");
    snapshot.synergies = [
      ...(snapshot.synergies ?? []),
      { owner: "Bolt", teammate: "Gene", source: "brawlscope", sourceUrl: "https://exemplo.test/bolt?mode=hotZone", rank: 1, modeId: "hotZone" },
    ];
    const aliados = getSnapshotSynergies(snapshot, "Bolt", "brawlscope", "hotZone");
    // Nada da leitura geral se mistura: o modo publicou, o modo manda.
    expect(aliados.map((entry) => entry.teammate)).toEqual(["Gene"]);
  });

  it("a leitura geral nunca traz listas de modo", () => {
    const snapshot = snapshotSoComGeral("brawlscope");
    snapshot.synergies = [
      { owner: "Bolt", teammate: "Gene", source: "brawlscope", sourceUrl: "https://exemplo.test/bolt?mode=hotZone", rank: 1, modeId: "hotZone" },
    ];
    expect(getSnapshotSynergies(snapshot, "Bolt", "brawlscope")).toEqual([]);
  });
});

describe("catálogo do BrawlScope a completar a leitura em direto", () => {
  afterEach(() => setCounterSyncSnapshot(undefined, { allowOfflineFallback: true }));

  /** Snapshot em que o BrawlScope publicou counters de Amber, mas nenhuma sinergia. */
  function comCountersSemSinergia(owner: string): CounterSyncSnapshotPayload {
    return {
      schemaVersion: 2,
      capturedAt: estado.fetchedAt,
      absenceStreaks: {},
      activeBrawlers: [owner, "Colt"],
      sourceStates: { brawlscope: estado, calculator: estado, planet: estado, prodigy: estado },
      relations: [
        { owner, direction: "targets", attacker: owner, defender: "Colt", source: "brawlscope", sourceUrl: "https://brawlscope.test/amber" },
      ],
      synergies: [],
    };
  }

  it("completa a lista Pair with de um perfil que a leitura em direto sustenta", () => {
    setCounterSyncSnapshot(comCountersSemSinergia("Amber"));
    const perfil = getCounterSourceProfiles("Amber").find((entry) => entry.source === "BrawlScope");

    // Sem isto, a recolha a falhar a ficha de um brawler deixava o Draft sem a
    // lista dele, havendo 105 fichas recolhidas em disco.
    expect(perfil).toBeDefined();
    expect(perfil?.bestTeammates.length).toBeGreaterThan(0);
  });

  /**
   * O Shade é o caso que mostrou que exigir counters estava errado.
   *
   * Está no catálogo de sinergia do BrawlScope, com "El Primo +5,0%" publicado,
   * e NÃO está no catálogo de counters. Enquanto o perfil dependeu de haver
   * counters, essa lista era deitada fora: o Draft mostrava só a do Brawl
   * Planet, e a do BrawlScope desaparecia sem explicação.
   *
   * As duas leituras saem da mesma página e são independentes — é o que o
   * caminho em direto já dizia, por escrito, e o que faltava aqui.
   */
  it("mostra a sinergia de quem tem Pair with publicado mas não tem ficha de counters", () => {
    setCounterSyncSnapshot(undefined, { allowOfflineFallback: true });
    const perfil = getCounterSourceProfiles("Shade").find((entry) => entry.source === "BrawlScope");

    expect(perfil?.bestTeammates.map((aliado) => aliado.brawler)).toContain("El Primo");
    // A snapshot de produção confirma o cenário: o BrawlScope não publicou nada
    // em direto sobre o Shade — nem sinergia nem counters — e a lista só pode
    // vir do catálogo.
    expect(perfil?.bestTeammates.find((aliado) => aliado.brawler === "El Primo")?.delta).toBe(5);
  });

  it("não cria perfil para quem não tem nada publicado em nenhuma das listas", () => {
    // O limite continua a existir: sem counters E sem aliados, não há perfil.
    setCounterSyncSnapshot(comCountersSemSinergia("Amber"));
    expect(getCounterSourceProfiles("Brawler Inexistente").find((entry) => entry.source === "BrawlScope")).toBeUndefined();
  });
});
