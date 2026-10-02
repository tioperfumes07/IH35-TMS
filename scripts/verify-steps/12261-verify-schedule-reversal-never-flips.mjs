// ROUND 300 — schedule-reversal-never-flips. Import-safe (no DB).
import { run } from "../verify-schedule-reversal-never-flips.mjs";

export default {
  name: "schedule-reversal-never-flips",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("schedule-reversal-never-flips FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
