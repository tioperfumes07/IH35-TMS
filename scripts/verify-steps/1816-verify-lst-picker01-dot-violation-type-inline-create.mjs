// LST-PICKER-01 HOSViolationsTab dot_violation_type (claim 1816).
import { collectProblems } from "../verify-lst-picker01-dot-violation-type-inline-create.mjs";
export default {
  name: "lst-picker01-dot-violation-type-inline-create",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-dot-violation-type-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
