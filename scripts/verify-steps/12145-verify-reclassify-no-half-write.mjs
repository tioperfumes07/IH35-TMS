// ROUND 326 queue item 16 — reclassify never moves the ledger without its document. Import-safe (no DB).
import { run } from "../verify-reclassify-no-half-write.mjs";

export default {
  name: "reclassify-no-half-write",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("reclassify-no-half-write FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
