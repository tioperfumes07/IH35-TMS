// Lead ROUND 332 — an invoice may not be issued without its ledger entry and spine link. Import-safe (no DB).
import { run } from "../verify-invoice-issue-implies-posted-and-linked.mjs";

export default {
  name: "invoice-issue-implies-posted-and-linked",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("invoice-issue-implies-posted-and-linked FAIL:\n  " + failures.join("\n  "));
    }
  },
};
