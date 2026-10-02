// ROUND 326 audit A5 — one driver bill per load (team pairs excepted). Import-safe (no DB).
import { run } from "../verify-one-driver-bill-per-load.mjs";

export default {
  name: "one-driver-bill-per-load",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("one-driver-bill-per-load FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
