// Lead ROUND 330.6 — a faro_daily_imports header can never outlive all its lines. Import-safe (no DB).
import { run } from "../verify-faro-import-never-orphaned.mjs";

export default {
  name: "faro-import-never-orphaned",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("faro-import-never-orphaned FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
