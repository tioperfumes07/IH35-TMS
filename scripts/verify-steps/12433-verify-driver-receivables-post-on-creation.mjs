// ROUND 394 RULING 2 (CC-1): accident damage and civil / internal fines are driver receivables — posted on creation
// (Dr 1255 / 1256), recovered through settlement (Cr the receivable), written off only by a reversing entry.
// Import-safe static half; the live half (every one since the switch posted / reversed) runs in the gate.
import { run } from "../verify-driver-receivables-post-on-creation.mjs";

export default {
  name: "driver-receivables-post-on-creation",
  run: async () => {
    const problems = run();
    if (problems.length) throw new Error("driver-receivables-post-on-creation FAIL:\n  " + problems.join("\n  "));
  },
};
