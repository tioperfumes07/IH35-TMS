// Banking Full Audit FAIL-6/7 — Factoring + Relay Card entry tabs.
import { run } from "../verify-banking-factoring-relay-tabs.mjs";

export default {
  name: "banking-factoring-relay-tabs",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("banking-factoring-relay-tabs FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
