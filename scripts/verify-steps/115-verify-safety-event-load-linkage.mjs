// biz-flow-1-termination-not-linked-to-load (non-financial read slice) wired into verify:pre-commit.
// Fails if the safety-event -> load reverse drill-through (entity-scoped LEFT JOIN mdata.loads +
// related_load_number surface) is weakened/removed. Import-safe.
import { run } from "../verify-safety-event-load-linkage.mjs";
export default {
  name: "safety-event-load-linkage",
  run: async () => {
    const failures = run();
    if (failures.length)
      throw new Error("safety-event-load-linkage FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
  },
};
