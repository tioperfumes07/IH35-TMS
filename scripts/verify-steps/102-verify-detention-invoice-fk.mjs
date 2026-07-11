// P3-INVOICE-FK residual wired into verify:pre-commit. Fails if the detention->invoice FKs are weakened.
import { run } from "../verify-detention-invoice-fk.mjs";
export default { name: "detention-invoice-fk", run: async () => { const f = run(); if (f.length) throw new Error("detention-invoice-fk FAIL:\n  " + f.map((x)=>"✗ "+x).join("\n  ")); } };
