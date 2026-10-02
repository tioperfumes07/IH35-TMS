// ROUND 300 — a multi-JE void links its reversing JE from every original. Import-safe (no DB).
import { run } from "../verify-multi-je-void-links-every-original.mjs";

export default {
  name: "multi-je-void-links-every-original",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("multi-je-void-links-every-original FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
