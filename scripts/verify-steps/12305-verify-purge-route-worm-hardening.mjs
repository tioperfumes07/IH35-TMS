// Lead ROUND 331 / 334 — the permanent delete route stays hardened: ARM C via to_regprocedure, the ::regprocedure
// body held, the cascade matches confkey and detaches driver escrow, the route owner-only. Import-safe (no DB).
import { run } from "../verify-purge-route-worm-hardening.mjs";

export default {
  name: "purge-route-worm-hardening",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("purge-route-worm-hardening FAIL:\n  " + failures.join("\n  "));
    }
  },
};
