import { syncRankedData } from "../rankedSync.ts";

const result = await syncRankedData("manual");
console.log(JSON.stringify(result, null, 2));

if (!result.ok) process.exitCode = 1;
