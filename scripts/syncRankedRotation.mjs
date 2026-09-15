import { syncRankedData } from "../server/rankedSync.ts";

const result = await syncRankedData("manual");

console.log(JSON.stringify({
  ok: result.ok,
  version: result.ok ? result.version : null,
  rowCount: result.ok ? result.rowCount : null,
  error: result.ok ? null : result.error,
  topBrawl: result.ok ? { status: result.topBrawl.status, rows: result.topBrawl.rows.size } : null,
  brawlPlanet: result.ok ? {
    status: result.brawlPlanet.status,
    rows: result.brawlPlanet.rows.size,
    teams: result.brawlPlanet.mapTeams?.length ?? 0,
  } : null,
}, null, 2));

process.exit(result.ok ? 0 : 1);
