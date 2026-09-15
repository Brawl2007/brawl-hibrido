import { syncCounterData } from "../counterSync.ts";

const result = await syncCounterData("bootstrap");
console.log(JSON.stringify({
  ok: result.ok,
  version: result.ok ? result.version : undefined,
  relationCount: result.ok ? result.relationCount : undefined,
  error: result.ok ? undefined : result.error,
}, null, 2));

if (!result.ok) process.exitCode = 1;
