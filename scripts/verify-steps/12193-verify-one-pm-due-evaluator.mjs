// ROUND 326 audit M2 — one PM-due evaluator; completed PM work orders advance their schedule. Import-safe (no DB).
import { run } from "../verify-one-pm-due-evaluator.mjs";

export default {
  name: "one-pm-due-evaluator",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("one-pm-due-evaluator FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
