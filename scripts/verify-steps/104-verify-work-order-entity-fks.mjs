import { run } from "../verify-work-order-entity-fks.mjs";
export default { name: "work-order-entity-fks", run: async () => { const f = run(); if (f.length) throw new Error("work-order-entity-fks FAIL:\n  " + f.map((x)=>"✗ "+x).join("\n  ")); } };
