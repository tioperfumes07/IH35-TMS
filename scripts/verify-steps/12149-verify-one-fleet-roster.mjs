// ROUND 326 queue item 17 / M3 — one fleet roster for maintenance counts and CPM baselines. Import-safe (no DB).
import { run } from "../verify-one-fleet-roster.mjs";

export default {
  name: "one-fleet-roster",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("one-fleet-roster FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
