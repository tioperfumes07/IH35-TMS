// ROUND 297 driver-profile audit — collected deductions read 'applied'. Import-safe (no DB).
import { run } from "../verify-collected-deductions-read-applied.mjs";

export default {
  name: "collected-deductions-read-applied",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("collected-deductions-read-applied FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
