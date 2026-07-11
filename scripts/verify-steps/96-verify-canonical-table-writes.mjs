// G4 (LINKAGE-LAW canonical enforcement) wired into verify:pre-commit. Fails on a new write/FK to a
// RETIRE table. Import-safe; forward-only via scripts/.canonical-write-exempt.json baseline.
import { run } from "../verify-canonical-table-writes.mjs";

export default {
  name: "canonical-table-writes",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("canonical-table-writes FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
