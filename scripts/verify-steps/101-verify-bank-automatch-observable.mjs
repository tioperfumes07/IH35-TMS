// P2-BANK-AUTOMATCH wired into verify:pre-commit. Fails if the auto-match tick discards its metric.
import { run } from "../verify-bank-automatch-observable.mjs";
export default { name: "bank-automatch-observable", run: async () => { const f = run(); if (f.length) throw new Error("bank-automatch-observable FAIL:\n  " + f.map((x)=>"✗ "+x).join("\n  ")); } };
