import { describe, expect, it } from "vitest";
import { brawlScopeCounterData } from "../shared/brawlScopeCounterData";
import { plProdigyCounterData } from "../shared/plProdigyCounterData";
import type { CounterSyncSourceCollection } from "./counterSync";
import { buildStaticBrawlScopeCollection, buildStaticPLProdigyCollection, mergeCounterSyncPayload, parseBrawlScopeModePage } from "./counterSync";
import { brawlScopeModes } from "../shared/brawlScopeModes";

const capturedAt = "2026-08-24T16:00:00.000Z";

function source(
  name: CounterSyncSourceCollection["source"],
  complete: boolean,
  relations: CounterSyncSourceCollection["relations"] = [],
): CounterSyncSourceCollection {
  return {
    source: name,
    state: {
      status: name === "brawlscope" || name === "prodigy" ? "static" : complete ? "success" : "partial",
      complete,
      fetchedAt: capturedAt,
      brawlers: complete ? ["Bolt"] : [],
      relationCount: relations.length,
    },
    relations,
  };
}

/**
 * O Brawl Calculator deixou de ser fonte sincronizada de counters: `mergeCounterSyncPayload`
 * descarta as relações dele, tanto da leitura atual como do snapshot anterior, para
 * o mesmo confronto não ser contado por duas leituras. As fontes com direção
 * auditável são BrawlScope, Brawl Planet e PL Prodigy — por isso a retenção é
 * testada com o BrawlScope onde antes era testada com o Calculator.
 */
function collections(scopeRelations: CounterSyncSourceCollection["relations"], planetRelations: CounterSyncSourceCollection["relations"], planetComplete = true) {
  return [
    source("brawlscope", true, scopeRelations),
    source("prodigy", false),
    source("calculator", true, []),
    source("planet", planetComplete, planetRelations),
  ];
}

function counteredByBolt(sourceName: "brawlscope" | "calculator" | "planet") {
  return {
    owner: "Bolt",
    direction: "counteredBy" as const,
    attacker: "Surge",
    defender: "Bolt",
    source: sourceName,
    sourceUrl: `https://${sourceName}.test/bolt`,
  };
}

describe("counter synchronization retention", () => {
  it("unions every source roster and preserves BrawlScope editorial aliases", () => {
    const scope = source("brawlscope", true);
    scope.activeBrawlers = ["8-Bit", "R-T", "Mr. P", "Larry & Lawrie"];
    scope.state.brawlers = ["Ash"];
    const calculator = source("calculator", true);
    calculator.state.brawlers = ["8bit", "RT", "Mr P", "Larry", "Calculator Only"];
    const planet = source("planet", true);
    planet.state.brawlers = [" calculator_only ", "Planet Only"];
    const prodigy = source("prodigy", false);
    prodigy.state.brawlers = ["Prodigy Only"];
    const payload = mergeCounterSyncPayload(undefined, [calculator, planet, scope, prodigy], capturedAt);
    expect(payload.activeBrawlers).toEqual(["8-Bit", "R-T", "Mr. P", "Larry & Lawrie", "Ash", "Calculator Only", "Planet Only", "Prodigy Only"]);
  });

  it("parses the literal Counter with and Punishes lists for one BrawlScope mode", () => {
    const mode = brawlScopeModes.find((entry) => entry.id === "brawlBall")!;
    const html = `<h1>Bo counters</h1><p>Counter with</p><ul><li><a href="/counters/mina?mode=brawlBall"><span>Mina</span></a></li></ul><p>Punishes</p><ul><li><a href="/counters/fang?mode=brawlBall"><span>Fang</span></a></li></ul>`;
    expect(parseBrawlScopeModePage(html, mode, "https://brawlscope.com/counters/bo?mode=brawlBall")).toMatchObject({
      brawler: "Bo",
      counteredBy: ["Mina"],
      targets: ["Fang"],
      modeId: "brawlBall",
    });
  });

  it("keeps a relation while at least one authorized source still publishes it", () => {
    const previous = mergeCounterSyncPayload(undefined, collections(
      [counteredByBolt("brawlscope")],
      [counteredByBolt("planet")],
    ), capturedAt);

    const next = mergeCounterSyncPayload(previous, collections(
      [counteredByBolt("brawlscope")],
      [],
    ), "2026-08-24T17:00:00.000Z");

    expect(next.relations).toEqual([
      expect.objectContaining({ attacker: "Surge", defender: "Bolt", source: "brawlscope" }),
    ]);
    expect(next.absenceStreaks).toEqual({});

    // O Calculator, sozinho, não sustenta a relação: as suas leituras são
    // descartadas na fusão, por isso a ausência das fontes autorizadas continua
    // a contar mesmo com o Calculator a publicar o par.
    const calculatorOnly = mergeCounterSyncPayload(next, [
      source("brawlscope", true, []),
      source("prodigy", false),
      source("calculator", true, [counteredByBolt("calculator")]),
      source("planet", true, []),
    ], "2026-08-24T18:00:00.000Z");
    expect(calculatorOnly.relations).toEqual([
      expect.objectContaining({ attacker: "Surge", defender: "Bolt", source: "brawlscope", pendingRemoval: true }),
    ]);
  });

  it("removes only after two fully valid readings without evidence", () => {
    const initial = mergeCounterSyncPayload(undefined, collections([counteredByBolt("brawlscope")], []), capturedAt);
    const firstAbsence = mergeCounterSyncPayload(initial, collections([], []), "2026-08-24T17:00:00.000Z");
    const secondAbsence = mergeCounterSyncPayload(firstAbsence, collections([], []), "2026-08-24T18:00:00.000Z");

    expect(firstAbsence.relations).toEqual([
      expect.objectContaining({ attacker: "Surge", defender: "Bolt", pendingRemoval: true }),
    ]);
    expect(Object.values(firstAbsence.absenceStreaks)).toEqual([1]);
    expect(secondAbsence.relations).toEqual([]);
  });

  it("never turns a partial or failed source into absence evidence", () => {
    const initial = mergeCounterSyncPayload(undefined, collections([counteredByBolt("brawlscope")], []), capturedAt);
    const partial = mergeCounterSyncPayload(initial, collections([], [], false), "2026-08-24T17:00:00.000Z");

    expect(partial.relations).toEqual([
      expect.objectContaining({ attacker: "Surge", defender: "Bolt", pendingRemoval: false }),
    ]);
    expect(partial.absenceStreaks).toEqual({ ["surge:bolt"]: 0 });
  });

  it("preserves the fixed Glowy suppression and keeps every profile in the published orientation", () => {
    const staticCollection = buildStaticBrawlScopeCollection(capturedAt);
    expect(staticCollection.relations.some(relation => relation.attacker === "Glowy" && relation.defender === "Bolt")).toBe(false);

    const rawRuffs = brawlScopeCounterData.ruffs;
    expect(rawRuffs).toBeDefined();
    expect(staticCollection.relations.some(relation => relation.owner === "ruffs" && relation.direction === "targets" && relation.attacker === "ruffs" && relation.defender === rawRuffs.targets[0])).toBe(true);
    expect(staticCollection.relations.some(relation => relation.owner === "ruffs" && relation.direction === "counteredBy" && relation.attacker === rawRuffs.counteredBy[0] && relation.defender === "ruffs")).toBe(true);
  });

  it("includes the literal PL Prodigy targets and countered-by columns as a separate static source", () => {
    const staticCollection = buildStaticPLProdigyCollection(capturedAt);
    const [brawler, profile] = Object.entries(plProdigyCounterData)[0]!;

    expect(staticCollection.source).toBe("prodigy");
    expect(staticCollection.state.status).toBe("static");
    expect(staticCollection.state.brawlers).toHaveLength(Object.keys(plProdigyCounterData).length);
    expect(staticCollection.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: brawler, direction: "targets", attacker: brawler, defender: profile.targets[0], source: "prodigy", sourceUrl: profile.sourceUrl }),
      expect.objectContaining({ owner: brawler, direction: "counteredBy", attacker: profile.counteredBy[0], defender: brawler, source: "prodigy", sourceUrl: profile.sourceUrl }),
    ]));
  });

  it("keeps the two literal page views of a pair without turning either into every profile that references the pair", () => {
    const payload = mergeCounterSyncPayload(undefined, collections(
      [{ owner: "Bolt", direction: "targets", attacker: "Bolt", defender: "Ash", source: "brawlscope", sourceUrl: "https://brawlscope.test/bolt" }],
      [{ owner: "Ash", direction: "counteredBy", attacker: "Bolt", defender: "Ash", source: "planet", sourceUrl: "https://planet.test/ash" }],
    ), capturedAt);

    expect(payload.relations).toHaveLength(2);
    expect(payload.relations.map(relation => `${relation.owner}:${relation.direction}`)).toEqual(expect.arrayContaining(["Bolt:targets", "Ash:counteredBy"]));
  });

  it("keeps the same pair independently for each mode", () => {
    const base = counteredByBolt("brawlscope");
    const brawlBall = { ...base, modeId: "brawlBall", mode: "Fute-Brawl" };
    const hotZone = { ...base, modeId: "hotZone", mode: "Zona Estratégica" };
    const payload = mergeCounterSyncPayload(undefined, collections([brawlBall, hotZone], []), capturedAt);
    expect(payload.relations.filter((relation) => relation.modeId)).toHaveLength(2);
  });
});
