import { run } from "../verify-bills-mdata-vendor-fk.mjs";
export default { name: "bills-mdata-vendor-fk", run: async () => { const f = run(); if (f.length) throw new Error("bills-mdata-vendor-fk FAIL:\n  " + f.map((x)=>"✗ "+x).join("\n  ")); } };
