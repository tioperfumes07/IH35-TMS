// ROUND 326 item 18 — the Settlement Creator previews and posts through the close engine. Import-safe (no DB).
import { run } from "../verify-settlement-creator-posts-through-close.mjs";

export default {
  name: "settlement-creator-posts-through-close",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("settlement-creator-posts-through-close FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
