// ROUND 301 — bank-categorized driver advance: keyed at creation, resumable, never double-booked. Import-safe (no DB).
import { run } from "../verify-bank-driver-advance-resumable.mjs";

export default {
  name: "bank-driver-advance-resumable",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("bank-driver-advance-resumable FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
