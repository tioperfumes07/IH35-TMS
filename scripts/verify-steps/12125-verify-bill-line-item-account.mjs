// ROUND 326 queue item 11 (G-08) — an itemized bill line posts to its catalog item's account, never uncategorized /
// 9000. Import-safe (no DB).
import { run } from "../verify-bill-line-item-account.mjs";

export default {
  name: "bill-line-item-account",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("bill-line-item-account FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
