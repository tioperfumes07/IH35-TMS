// LST-PICKER-01 AutoDeductionPolicies driver_deduction_type (claim 2094).
import { collectProblems } from "../verify-lst-picker01-auto-deduction-type-inline-create.mjs";
export default {
  name: "lst-picker01-auto-deduction-type-inline-create",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-auto-deduction-type-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
