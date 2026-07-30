// LST-PICKER-01 HosViolationCreateModal dot_violation_type (claim 1824).
import { collectProblems } from "../verify-lst-picker01-hos-create-modal-dot-type-inline-create.mjs";
export default {
  name: "lst-picker01-hos-create-modal-dot-type-inline-create",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-hos-create-modal-dot-type-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
