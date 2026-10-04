// ROUND 389.3 RULING 2 (CC-1): driver sub-accounts are <parent>-00-nnn under 1245/1255/1256/1257/2100 with ONE nnn per
// driver across parents; both provisioners number from the shared allocator. Import-safe static half; the live half
// (every live USMCA driver sub-account matches, one nnn per driver) runs in the gate.
import { run } from "../verify-driver-subaccount-numbers-one-per-driver.mjs";

export default {
  name: "driver-subaccount-numbers-one-per-driver",
  run: async () => {
    const problems = run();
    if (problems.length) throw new Error("driver-subaccount-numbers-one-per-driver FAIL:\n  " + problems.join("\n  "));
  },
};
