// ROUND 394 RULING 1 (CC-1): a driver cash advance debits and is recovered on the driver's OWN 1245 sub-account
// (bridge + advance_recovery role parent), never a shared account. Import-safe static half; the live half
// (0 postings on the shared parent since the switch) runs in the gate.
import { run } from "../verify-driver-advance-posts-to-drivers-own-subaccount.mjs";

export default {
  name: "driver-advance-posts-to-drivers-own-subaccount",
  run: async () => {
    const problems = run();
    if (problems.length) throw new Error("driver-advance-posts-to-drivers-own-subaccount FAIL:\n  " + problems.join("\n  "));
  },
};
