// ROUND 300 — period reopen reverses the retained-earnings closing entry. Import-safe (no DB).
import { run } from "../verify-period-reopen-reverses-closing-entry.mjs";

export default {
  name: "period-reopen-reverses-closing-entry",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("period-reopen-reverses-closing-entry FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
