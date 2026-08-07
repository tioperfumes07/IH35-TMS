// LST-PICKER conflict treadmill kill (claim 1828).
import { collectProblems } from "../verify-lst-picker-no-lists-json-partial-thrash.mjs";
export default {
  name: "lst-picker-no-lists-json-partial-thrash",
  run: async (ctx) => {
    // Selftest is fixture-based (independent of live LST-PICKER-01 PASS/FAIL).
    // Must stay green on clean main — otherwise husky/pre-push and CI lock every push.
    ctx.run("node", [
      "scripts/verify-lst-picker-no-lists-json-partial-thrash.mjs",
      "--selftest",
    ]);
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker-no-lists-json-partial-thrash FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
