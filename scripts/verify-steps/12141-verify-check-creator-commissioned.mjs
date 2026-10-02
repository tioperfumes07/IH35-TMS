// ROUND 326 queue item 15 (G-16) — check creator commissioned: printable face, writable offsets, stored style kept,
// closed period 409. Import-safe (no DB).
import { run } from "../verify-check-creator-commissioned.mjs";

export default {
  name: "check-creator-commissioned",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("check-creator-commissioned FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
