import { run } from "../verify-phase4-crossmodule-fks.mjs";
export default { name: "phase4-crossmodule-fks", run: async () => { const f = run(); if (f.length) throw new Error("phase4-crossmodule-fks FAIL:\n  " + f.map((x)=>"✗ "+x).join("\n  ")); } };
