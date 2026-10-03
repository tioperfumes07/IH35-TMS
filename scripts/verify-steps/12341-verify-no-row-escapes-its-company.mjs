// Lead 10-03 — no row escapes its company: the closures on expense_lines / bill_lines / load_charge_lines stay declared.
// Import-safe static half (the live, UNSCOPED half runs in the money gate: scripts/verify-no-row-escapes-its-company.mjs).
import { run } from "../verify-no-row-escapes-its-company.mjs";

export default {
  name: "no-row-escapes-its-company",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("no-row-escapes-its-company FAIL:\n  " + failures.join("\n  "));
    }
  },
};
