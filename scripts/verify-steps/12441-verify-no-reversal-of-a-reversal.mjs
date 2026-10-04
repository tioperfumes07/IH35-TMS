// ROUND 390.1 (CC-1): a reversal line is terminal — posting-line-writer refuses a reversal of a reversal by name, and
// reinstate / check unvoid / reclassify undo restore reversed money as fresh lines instead. Import-safe static half; the
// live chain count (must be 0, no baseline) runs with --live.
import { run } from "../verify-no-reversal-of-a-reversal.mjs";

export default {
  name: "no-reversal-of-a-reversal",
  run: async () => {
    const problems = run();
    if (problems.length) throw new Error("no-reversal-of-a-reversal FAIL:\n  " + problems.join("\n  "));
  },
};
