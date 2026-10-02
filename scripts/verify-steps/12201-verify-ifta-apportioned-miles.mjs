// ROUND 288.3 item 1 — IFTA miles are GPS-apportioned; no surface sums load miles per state. Import-safe (no DB).
import { run } from "../verify-ifta-apportioned-miles.mjs";

export default {
  name: "ifta-apportioned-miles",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("ifta-apportioned-miles FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
