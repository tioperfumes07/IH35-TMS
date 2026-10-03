// ROUND 380.2: no migration is neither applied nor held. Import-safe static half (every held-registry entry exists on
// disk); the live half (0 unapplied, unheld files older than the newest applied) runs in the money gate.
import { run } from "../verify-no-migration-is-neither-applied-nor-held.mjs";

export default {
  name: "no-migration-is-neither-applied-nor-held",
  run: async () => {
    const problems = run();
    if (problems.length) throw new Error("no-migration-is-neither-applied-nor-held FAIL:\n  " + problems.join("\n  "));
  },
};
