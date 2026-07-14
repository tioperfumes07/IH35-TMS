import { run } from "../verify-claim-crossmodule-fks.mjs";
export default { name: "claim-crossmodule-fks", run: async () => { const f = run(); if (f.length) throw new Error("claim-crossmodule-fks FAIL:\n  " + f.map((x)=>"✗ "+x).join("\n  ")); } };
