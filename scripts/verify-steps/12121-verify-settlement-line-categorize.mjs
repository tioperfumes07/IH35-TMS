// ROUND 326 queue item 10 (G-05) — one settlement-line categorizer run by both closes. Import-safe (no DB).
import { run } from "../verify-settlement-line-categorize.mjs";

export default {
  name: "settlement-line-categorize",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("settlement-line-categorize FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
