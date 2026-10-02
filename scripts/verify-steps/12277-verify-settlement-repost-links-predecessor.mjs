// Lead ROUND 330.6 — re-posted settlement carries predecessor / successor links. Import-safe (no DB).
import { run } from "../verify-settlement-repost-links-predecessor.mjs";

export default {
  name: "settlement-repost-links-predecessor",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("settlement-repost-links-predecessor FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
