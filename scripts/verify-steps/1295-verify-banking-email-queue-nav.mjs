// Banking Full Audit FAIL-4 — Email Queue reachability (not a routed orphan).
import { run } from "../verify-banking-email-queue-nav.mjs";

export default {
  name: "banking-email-queue-nav",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("banking-email-queue-nav FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
