import { describe, expect, it } from "vitest";
import type { CounterRelation } from "../drizzle/schema";
import { resolveContextualCounterRelations } from "./db";

function relation(overrides: Partial<CounterRelation>): CounterRelation {
  return {
    id: 1,
    attacker: "Bea",
    defender: "Bibi",
    mapId: null,
    mode: null,
    source: "calculator",
    confidence: "0.5000",
    sampleSize: null,
    tip: null,
    sourceUrl: null,
    observedAt: null,
    createdAt: new Date("2026-08-16T00:00:00.000Z"),
    updatedAt: new Date("2026-08-16T00:00:00.000Z"),
    ...overrides,
  } as CounterRelation;
}

describe("contextual counter relations", () => {
  const matchup = { attacker: "Bea", defender: "Bibi", mapId: "New Horizons", mode: "Nocaute" };

  it("prioritizes a map relation over a contradictory global fallback", () => {
    const result = resolveContextualCounterRelations(matchup, [
      relation({ attacker: "Bibi", defender: "Bea", confidence: "0.9000" }),
      relation({ mapId: "New Horizons", mode: "Nocaute", confidence: "0.1000" }),
    ]);

    expect(result).toMatchObject({ scope: "map", direction: "targets" });
    expect(result.relation).toMatchObject({ attacker: "Bea", defender: "Bibi", mapId: "New Horizons" });
  });

  it("uses a mode relation when no relation exists for the selected map", () => {
    const result = resolveContextualCounterRelations(matchup, [
      relation({ attacker: "Bibi", defender: "Bea", mode: "Nocaute", confidence: "0.7000" }),
      relation({ confidence: "0.9000" }),
    ]);

    expect(result).toMatchObject({ scope: "mode", direction: "counteredBy" });
    expect(result.relation).toMatchObject({ attacker: "Bibi", defender: "Bea", mode: "Nocaute" });
  });

  it("returns a neutral conflict when opposite directions have equal evidence in one context", () => {
    const result = resolveContextualCounterRelations(matchup, [
      relation({ mapId: "New Horizons", mode: "Nocaute", confidence: "0.6000", sampleSize: 40 }),
      relation({ attacker: "Bibi", defender: "Bea", mapId: "New Horizons", mode: "Nocaute", confidence: "0.6000", sampleSize: 40 }),
    ]);

    expect(result).toMatchObject({ scope: "map", direction: "conflict" });
    expect(result.relation).toMatchObject({ attacker: "Bea", defender: "Bibi" });
    expect(result.opposingRelation).toMatchObject({ attacker: "Bibi", defender: "Bea" });
  });

  it("selects the direction with stronger evidence when a context contains both directions", () => {
    const result = resolveContextualCounterRelations(matchup, [
      relation({ mapId: "New Horizons", mode: "Nocaute", source: "planet", confidence: "0.8000" }),
      relation({ attacker: "Bibi", defender: "Bea", mapId: "New Horizons", mode: "Nocaute", source: "prodigy", confidence: "0.9000" }),
    ]);

    expect(result).toMatchObject({ scope: "map", direction: "counteredBy" });
    expect(result.relation).toMatchObject({ attacker: "Bibi", defender: "Bea", source: "prodigy" });
  });
});
