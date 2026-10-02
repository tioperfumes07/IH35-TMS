// ROUND 301 — reversing a cash advance voids its repayment deduction. Import-safe (no DB).
import { run } from "../verify-advance-reverse-voids-repayment.mjs";

export default {
  name: "advance-reverse-voids-repayment",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("advance-reverse-voids-repayment FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
