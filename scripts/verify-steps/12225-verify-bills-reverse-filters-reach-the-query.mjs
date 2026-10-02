// ROUND 297 driver-profile audit — every Bills-panel filter reaches the SQL. Import-safe (no DB).
import { run } from "../verify-bills-reverse-filters-reach-the-query.mjs";

export default {
  name: "bills-reverse-filters-reach-the-query",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("bills-reverse-filters-reach-the-query FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
