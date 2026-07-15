// #3 wired into verify:pre-commit. Fails if internal-labor WO close re-introduces a lineless (unbalanced)
// accounting.journal_entries header. Import-safe (no DB).
import { run } from "../verify-internal-labor-no-lineless-je.mjs";

export default {
  name: "internal-labor-no-lineless-je",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("internal-labor-no-lineless-je FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
