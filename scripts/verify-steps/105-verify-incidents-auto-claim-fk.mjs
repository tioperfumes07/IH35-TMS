import { run } from "../verify-incidents-auto-claim-fk.mjs";
export default { name: "incidents-auto-claim-fk", run: async () => { const f = run(); if (f.length) throw new Error("incidents-auto-claim-fk FAIL:\n  " + f.map((x)=>"✗ "+x).join("\n  ")); } };
