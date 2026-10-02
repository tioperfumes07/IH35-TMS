// ROUND 326 queue item 12 (G-06) — every matched receipt sweeps out of 1090 (1:1 and multi-match), sweep config gaps
// refuse, payments default to the operating bank. Import-safe (no DB).
import { run } from "../verify-1090-clearing.mjs";

export default {
  name: "1090-clearing",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("1090-clearing FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
