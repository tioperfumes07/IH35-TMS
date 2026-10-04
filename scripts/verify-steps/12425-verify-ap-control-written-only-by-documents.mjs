// ROUND 393.1 (CC-1): A/P (ap_control, by role) is written only by its documents; the refusal is in the database
// (202615380200). Import-safe static half; the live half (trigger armed, 0 undocumented A/P lines since) runs in the gate.
import { run } from "../verify-ap-control-written-only-by-documents.mjs";

export default {
  name: "ap-control-written-only-by-documents",
  run: async () => {
    const problems = run();
    if (problems.length) throw new Error("ap-control-written-only-by-documents FAIL:\n  " + problems.join("\n  "));
  },
};
