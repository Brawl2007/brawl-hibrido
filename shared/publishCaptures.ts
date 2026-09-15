import { normalizeBrawlScopeModeId } from "./brawlScopeModes";
import type { BrawlScopeCapture } from "./brawlScopeCapture";
import type { CounterSyncSnapshotPayload } from "./counterSyncSnapshot";

/** Replace only captured owner/view lists; preserve every unrelated source/view. */
export function applyCapturedProfiles(previous: CounterSyncSnapshotPayload, captures: readonly BrawlScopeCapture[], capturedAt: string): CounterSyncSnapshotPayload {
  const key = (owner: string, view?: string) => `${owner.toLowerCase()}:${normalizeBrawlScopeModeId(view) || view || "overall"}`;
  const latest = new Map(captures.map(profile => [key(profile.brawler, profile.view), profile]));
  const retained = (relation: { source: string; owner: string; modeId?: string }) =>
    relation.source !== "brawlscope" || !latest.has(key(relation.owner, relation.modeId));
  const relations = previous.relations.filter(retained);
  const synergies = (previous.synergies ?? []).filter(retained);
  for (const profile of latest.values()) {
    const context = { owner: profile.brawler, source: "brawlscope" as const, sourceUrl: profile.url, modeId: profile.view === "overall" ? undefined : profile.view };
    for (const row of profile.targets) relations.push({ ...context, direction: "targets", attacker: profile.brawler, defender: row.brawler, delta: row.delta });
    for (const row of profile.counteredBy) relations.push({ ...context, direction: "counteredBy", attacker: row.brawler, defender: profile.brawler, delta: row.delta });
    profile.synergies.forEach((row, index) => synergies.push({ ...context, teammate: row.brawler, delta: row.delta, rank: index + 1 }));
  }
  return { ...previous, capturedAt, relations, synergies,
    activeBrawlers: Array.from(new Set([...(previous.activeBrawlers ?? []), ...captures.map(p => p.brawler)])),
    sourceStates: { ...previous.sourceStates, brawlscope: { ...previous.sourceStates.brawlscope,
      status: "partial", complete: false,
      fetchedAt: captures.reduce((latest, p) => p.capturedAt > latest ? p.capturedAt : latest, ""),
      brawlers: Array.from(new Set([...(previous.sourceStates.brawlscope?.brawlers ?? []), ...captures.map(p => p.brawler)])),
      relationCount: relations.filter(r => r.source === "brawlscope").length,
      note: `${latest.size} fichas do navegador publicadas. As restantes vistas e fontes foram preservadas.`,
    } },
  };
}
