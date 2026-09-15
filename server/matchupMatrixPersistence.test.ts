import { describe, expect, it } from "vitest";
import { readStoredMatchupMatrices, toPublicCounterSnapshotPayload } from "./counterSync";
import { encodeMatchupMatrices, type MatchupMatrices } from "@shared/matchupMatrixCodec";
import { brawlScopeMatchupDeltas } from "@shared/brawlScopeMatchupDeltas.generated";
import type { CounterSyncSnapshotPayload } from "@shared/counterSyncSnapshot";

/** Matriz realista: a tabela geral completa replicada pelas sete vistas. */
function matrizesReais(): MatchupMatrices {
  const uma = Object.fromEntries(
    Object.entries(brawlScopeMatchupDeltas).map(([name, profile]) => [name, profile.deltas]),
  );
  return Object.fromEntries(
    ["overall", "gemGrab", "brawlBall", "knockout", "heist", "hotZone", "bounty"].map((view) => [view, uma]),
  );
}

function snapshotBase(): CounterSyncSnapshotPayload {
  return {
    schemaVersion: 2,
    capturedAt: "2026-09-11T12:00:00.000Z",
    sourceStates: {
      brawlscope: { status: "success", complete: true, fetchedAt: "2026-09-11T12:00:00.000Z", brawlers: [], relationCount: 0 },
      calculator: { status: "static", complete: false, fetchedAt: "2026-09-11T12:00:00.000Z", brawlers: [], relationCount: 0 },
      planet: { status: "success", complete: true, fetchedAt: "2026-09-11T12:00:00.000Z", brawlers: [], relationCount: 0 },
      prodigy: { status: "static", complete: false, fetchedAt: "2026-09-11T12:00:00.000Z", brawlers: [], relationCount: 0 },
    },
    relations: [],
    absenceStreaks: {},
  };
}

describe("matrizes por modo gravadas com a snapshot", () => {
  it("nunca deixa as matrizes sair para os clientes", () => {
    /**
     * A asserção mais importante deste ficheiro. A snapshot pública alimenta o
     * evento SSE inicial: se as matrizes passassem, cada separador aberto
     * recebia centenas de milhares de números a cada sincronização — sem erro
     * nenhum, apenas um site lento. Um teste é a única forma de isto não voltar.
     */
    const gravada: CounterSyncSnapshotPayload = {
      ...snapshotBase(),
      matchupMatrices: encodeMatchupMatrices(matrizesReais(), "2026-09-11T12:00:00.000Z"),
    };
    const publica = toPublicCounterSnapshotPayload(gravada);

    expect(publica.matchupMatrices).toBeUndefined();
    expect(JSON.stringify(publica)).not.toContain("matchupMatrices");
    // A carga pública tem de ser uma fração ínfima da gravada.
    expect(JSON.stringify(publica).length).toBeLessThan(JSON.stringify(gravada).length / 100);
  });

  it("deixa tudo o resto intacto", () => {
    const base = snapshotBase();
    const publica = toPublicCounterSnapshotPayload({ ...base, matchupMatrices: encodeMatchupMatrices({ knockout: { A: { B: 1 } } }) });

    expect(publica).toEqual(base);
  });

  it("aguenta uma snapshot que nunca teve matrizes", () => {
    const base = snapshotBase();
    expect(toPublicCounterSnapshotPayload(base)).toEqual(base);
  });

  it("recupera as matrizes exatamente como estavam", () => {
    const originais = matrizesReais();
    const raw = JSON.stringify({ ...snapshotBase(), matchupMatrices: encodeMatchupMatrices(originais, "2026-09-11T12:00:00.000Z") });

    const { matrices, capturedAt } = readStoredMatchupMatrices(raw);

    expect(Object.keys(matrices).sort()).toEqual(["bounty", "brawlBall", "gemGrab", "heist", "hotZone", "knockout", "overall"]);
    expect(matrices).toEqual(originais);
    expect(capturedAt).toBe("2026-09-11T12:00:00.000Z");
  });

  it("cabe numa fração do que ocupariam em JSON literal", () => {
    // O custo de gravar isto a cada sincronização tem de ser razoável.
    const originais = matrizesReais();
    const literal = JSON.stringify(originais).length;
    const gravado = JSON.stringify(encodeMatchupMatrices(originais)).length;

    expect(gravado).toBeLessThan(literal * 0.35);
    expect(gravado).toBeLessThan(600_000);
  });

  it("devolve vazio em vez de rebentar quando a snapshot está ilegível", () => {
    for (const entrada of [undefined, "", "{", "null", "[]", JSON.stringify({ schemaVersion: 1 })]) {
      expect(readStoredMatchupMatrices(entrada).matrices).toEqual({});
    }
  });

  it("trata uma snapshot antiga, sem o campo, como ausência e não como vazio", () => {
    // Snapshots gravadas antes desta funcionalidade não têm o campo. Recuperar
    // zero matrizes é o comportamento certo: a recolha volta a enchê-las.
    const antiga = JSON.stringify(snapshotBase());
    const { matrices, capturedAt } = readStoredMatchupMatrices(antiga);

    expect(matrices).toEqual({});
    expect(capturedAt).toBe("2026-09-11T12:00:00.000Z");
  });
});
