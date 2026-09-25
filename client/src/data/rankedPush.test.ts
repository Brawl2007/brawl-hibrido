import { describe, expect, it } from "vitest";
import { applyRankedSnapshotPush, parseRankedSnapshotEvent, type RankedSnapshotEvent } from "@shared/rankedSyncSnapshot";
import { buildActiveRankedMapCatalog, normalizeRankedRows } from "./rankedData";
import { rankDraftEntries } from "@shared/draft";

function event(version: string, bibiWinRate: number, shellyWinRate: number): RankedSnapshotEvent {
  const rows = [
    { map: "Beach Ball", mode: "Fute-Brawl", modeId: "brawl-ball", brawler: "Bibi", score: 80, tier: "A" as const, usage: 10, winRate: bibiWinRate },
    { map: "Beach Ball", mode: "Fute-Brawl", modeId: "brawl-ball", brawler: "Shelly", score: 79, tier: "A" as const, usage: 10, winRate: shellyWinRate },
  ];
  return {
    version,
    capturedAt: `2026-09-06T00:0${version.endsWith("2") ? "2" : "1"}:00.000Z`,
    syncState: "success",
    nextRefreshAt: "2026-09-06T01:00:00.000Z",
    sourceStatus: { topBrawl: "success", brawlPlanet: "success" },
    rowCount: rows.length,
    payload: {
      rows,
      maps: [{ name: "Beach Ball", mode: "Fute-Brawl", modeId: "brawl-ball", brawlerCount: 2, topScore: 80, tiers: { S: 0, A: 2, B: 0 } }],
      mapTeams: [],
      updatedAt: "2026-09-06T00:00:00.000Z",
      sourceStatus: { topBrawl: "success", brawlPlanet: "success" },
    },
  };
}

describe("Ranked push client behaviour", () => {
  it("parses and applies a newer SSE snapshot as the primary state", () => {
    const initial = event("live-1", 48, 52);
    const next = event("live-2", 62, 38);
    const parsed = parseRankedSnapshotEvent(JSON.stringify(next));
    const applied = applyRankedSnapshotPush(initial, parsed);

    expect(applied.version).toBe("live-2");
    expect(applied.payload.rows.find((row) => row.brawler === "Bibi")?.winRate).toBe(62);
    expect(applied.nextRefreshAt).toBe("2026-09-06T01:00:00.000Z");
  });

  it("recomputes active maps and recommendations without resetting local draft choices", () => {
    const previous = event("live-1", 48, 52);
    const next = applyRankedSnapshotPush(previous, event("live-2", 62, 38));
    const rows = normalizeRankedRows(next.payload.rows);
    const maps = buildActiveRankedMapCatalog(next.payload.maps, rows, [], 0.7);
    const choices = ["Bibi", null, "Shelly"];
    const entries = rankDraftEntries(rows.filter((row) => row.map === "Beach Ball"), new Set(["Bibi", "Shelly"]), "", "Todos", {
      mapModeId: "brawl-ball",
      popularityRows: rows,
      experimentalWeights: { winRate: 70, usageRate: 30 },
    });

    expect(maps).toHaveLength(1);
    expect(maps[0].name).toBe("Beach Ball");
    expect(rows.find((row) => row.brawler === "Bibi")?.winRate).toBe(62);
    expect(entries).toBeDefined();
    expect(choices).toEqual(["Bibi", null, "Shelly"]);
  });
});

describe("fica sempre a snapshot mais recente, venha da consulta ou da stream", () => {
  const com = (version: string, capturedAt: string | null) => ({ ...event(version, 50, 50), version, capturedAt });

  it("a consulta de \"Atualizar agora\" substitui o que a stream trouxe antes (o defeito dos elos cinzentos)", () => {
    const daStream = com("live-antiga", "2026-09-25T05:01:30.000Z");
    const daConsulta = com("live-nova", "2026-09-25T20:32:06.000Z");
    expect(applyRankedSnapshotPush(daStream, daConsulta).version).toBe("live-nova");
  });

  it("uma snapshot mais antiga não substitui uma mais recente, por qualquer dos caminhos", () => {
    const nova = com("live-nova", "2026-09-25T20:32:06.000Z");
    const antiga = com("live-antiga", "2026-09-25T05:01:30.000Z");
    expect(applyRankedSnapshotPush(nova, antiga).version).toBe("live-nova");
  });

  it("a base incluída no projeto (sem data) perde sempre para uma recolha", () => {
    const base = com("bundled-static", null);
    const recolha = com("live-1", "2026-09-25T05:01:30.000Z");
    expect(applyRankedSnapshotPush(base, recolha).version).toBe("live-1");
    expect(applyRankedSnapshotPush(recolha, base).version).toBe("live-1");
  });

  it("a mesma snapshot outra vez não redesenha nada", () => {
    const a = com("live-1", "2026-09-25T05:01:30.000Z");
    expect(applyRankedSnapshotPush(a, { ...a })).toBe(a);
  });

  it("o contexto ouve a consulta também depois da stream", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const contexto = readFileSync(new URL("../contexts/RankedSyncContext.tsx", import.meta.url), "utf8");
    expect(contexto).not.toContain("if (!snapshotQuery.data || hasPushRef.current) return;");
    expect(contexto).toContain("setEvent((current) => applyRankedSnapshotPush(current, {");
  });
});
