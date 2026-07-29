// BANK-F11 — ON CONFLICT (bank_account_id, dedup_hash) must match partial unique index predicate.
import { run } from "../verify-bank-dedup-on-conflict-partial-index.mjs";
export default {
  name: "bank-dedup-on-conflict-partial-index",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error("bank-dedup-on-conflict-partial-index FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
    }
  },
};
