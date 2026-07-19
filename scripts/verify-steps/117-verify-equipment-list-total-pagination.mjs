// 0091-g9-h6 (trailer follow-up) wired into verify:pre-commit. Fails if GET /mdata/equipment
// stops returning a real total + has_more over the same filtered/scoped set (which would
// re-strand trailers past the first page). Import-safe. Rule 17: no package.json / CI hot-file edits.
import { run } from "../verify-equipment-list-total-pagination.mjs";
export default {
  name: "equipment-list-total-pagination",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error(
        "equipment-list-total-pagination FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  ")
      );
    }
  },
};
