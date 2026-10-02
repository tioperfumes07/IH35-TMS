// ROUND 300 — reversed-schedule-row-reposts-fresh. Import-safe (no DB).
import { run } from "../verify-reversed-schedule-row-reposts-fresh.mjs";

export default {
  name: "reversed-schedule-row-reposts-fresh",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("reversed-schedule-row-reposts-fresh FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
