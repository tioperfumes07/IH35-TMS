// ROUND 326 queue item 23 — the table-and-stamp snapshot is read-only, self-discovering, every stamp reported.
// Import-safe (no DB).
import { run } from "../verify-table-stamp-snapshot.mjs";

export default {
  name: "table-stamp-snapshot",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("table-stamp-snapshot FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
