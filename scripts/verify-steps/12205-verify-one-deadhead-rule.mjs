// ROUND 288.3 item 2 — one deadhead rule for the driver bill, the Settlement Creator and batch pay. Import-safe.
import { run } from "../verify-one-deadhead-rule.mjs";

export default {
  name: "one-deadhead-rule",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("one-deadhead-rule FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
