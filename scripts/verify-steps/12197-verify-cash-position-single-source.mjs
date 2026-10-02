// ROUND 326 audit C1 — one cash position for the cash forecast and the cash-flow board. Import-safe (no DB).
import { run } from "../verify-cash-position-single-source.mjs";

export default {
  name: "cash-position-single-source",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("cash-position-single-source FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
