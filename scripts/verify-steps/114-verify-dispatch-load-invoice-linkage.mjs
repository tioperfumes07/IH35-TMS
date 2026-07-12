// dispatch-sweep-gap-21 wired into verify:pre-commit. Fails if the active-loads listing loses its
// read-only load→invoice reverse linkage (accounting.invoices on source_load_id) or its entity scope.
// Import-safe.
import { run } from "../verify-dispatch-load-invoice-linkage.mjs";
export default {
  name: "dispatch-load-invoice-linkage",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error("dispatch-load-invoice-linkage FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
  },
};
