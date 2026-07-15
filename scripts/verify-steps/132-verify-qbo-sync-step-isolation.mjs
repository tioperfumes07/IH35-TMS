// B-A2 wired into verify:pre-commit. Fails if the QBO sync scheduler loses per-step/per-company error
// isolation or the owner-only manual trigger regresses. Import-safe (no DB).
import { run } from "../verify-qbo-sync-step-isolation.mjs";

export default {
  name: "qbo-sync-step-isolation",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("qbo-sync-step-isolation FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
