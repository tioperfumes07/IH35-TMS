// ROUND 326 audit M1 — one work-order creator (shrink-only baseline of direct inserters). Import-safe (no DB).
import { run } from "../verify-work-order-single-creator.mjs";

export default {
  name: "work-order-single-creator",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("work-order-single-creator FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
