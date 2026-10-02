// ROUND 326 queue item 22 — the zero-reset scope of the complete-delete engine keeps every owner condition. Import-safe.
import { run } from "../verify-zero-reset-engine.mjs";

export default {
  name: "zero-reset-engine",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("zero-reset-engine FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
