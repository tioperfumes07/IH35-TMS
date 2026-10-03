// Lead ROUND 342 phase 5 — one entity column: the event trigger and the audit writer stay on operating_company_id.
// Import-safe static half (the live half runs in the money gate: scripts/verify-one-entity-column.mjs).
import { run } from "../verify-one-entity-column.mjs";

export default {
  name: "one-entity-column",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("one-entity-column FAIL:\n  " + failures.join("\n  "));
    }
  },
};
