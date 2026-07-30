// LST-PICKER conflict treadmill kill (claim 1828).
import { collectProblems } from "../verify-lst-picker-no-lists-json-partial-thrash.mjs";
export default {
  name: "lst-picker-no-lists-json-partial-thrash",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker-no-lists-json-partial-thrash FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
