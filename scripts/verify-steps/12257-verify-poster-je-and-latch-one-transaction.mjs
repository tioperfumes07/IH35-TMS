// ROUND 301 audit — posters commit the JE and their idempotency latch together. Import-safe (no DB).
import { run } from "../verify-poster-je-and-latch-one-transaction.mjs";

export default {
  name: "poster-je-and-latch-one-transaction",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("poster-je-and-latch-one-transaction FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
