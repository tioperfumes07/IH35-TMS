// ROUND 296 5 — the driver-finance surfaces format money through lib/money only. Import-safe (no DB).
import { run } from "../verify-driver-finance-lib-money.mjs";

export default {
  name: "driver-finance-lib-money",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("driver-finance-lib-money FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
