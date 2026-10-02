// ROUND 326 queue item 2 — ONE settlement poster: Close posts the per-load A/P chain, the retired
// bill-payment-post route answers 410, no clearing account. Import-safe (no DB).
import { run } from "../verify-single-settlement-poster.mjs";

export default {
  name: "single-settlement-poster",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("single-settlement-poster FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
