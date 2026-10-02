// ROUND 326 queue item 14 (G-18) — no reverse / re-post churn on bank categorizations (6300). Import-safe (no DB).
import { run } from "../verify-6300-no-churn.mjs";

export default {
  name: "6300-no-churn",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("6300-no-churn FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
