import { getPLProdigyCounterProfile } from "../shared/counterSourceRelations.ts";
import { plProdigyCounterData } from "../shared/plProdigyCounterData.ts";

const profile = getPLProdigyCounterProfile("8-bit");
console.log(JSON.stringify({
  snapshot: plProdigyCounterData["8-bit"],
  resolved: profile,
}, null, 2));
