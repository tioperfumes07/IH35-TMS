// LST-PICKER-01 CompanyViolationCreateModal company_violation_type (claim 1814).
import { collectProblems } from "../verify-lst-picker01-company-violation-type-inline-create.mjs";
export default {
  name: "lst-picker01-company-violation-type-inline-create",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-company-violation-type-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
