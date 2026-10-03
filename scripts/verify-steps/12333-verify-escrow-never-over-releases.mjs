// Standing order F-1 — a driver's escrow never releases more than it holds: the three database refusals stay in place.
// Import-safe static half (the live half runs in the money gate: scripts/verify-escrow-never-over-releases.mjs).
import { run } from "../verify-escrow-never-over-releases.mjs";

export default {
  name: "escrow-never-over-releases",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("escrow-never-over-releases FAIL:\n  " + failures.join("\n  "));
    }
  },
};
