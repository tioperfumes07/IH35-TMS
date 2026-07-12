// 0091-g9-h6 wired into verify:pre-commit. Fails if the Chart-of-Accounts management list stops
// returning a total row count + has_more flag (which would re-strand the oldest accounts past the
// first page). Import-safe.
import { run } from "../verify-coa-list-total-pagination.mjs";
export default {
  name: "coa-list-total-pagination",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("coa-list-total-pagination FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
