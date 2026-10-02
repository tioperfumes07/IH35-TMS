// ROUND 326 queue item 7 (G-10) — empty-mile pay uses the empty rate, else the loaded per-mile rate; never a
// silent $0 on real empty miles. Import-safe (no DB).
import { run } from "../verify-deadhead-empty-rate-fallback.mjs";

export default {
  name: "deadhead-empty-rate-fallback",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("deadhead-empty-rate-fallback FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
