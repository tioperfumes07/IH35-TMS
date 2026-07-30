// LST-PICKER-01 InternalFinesPage internal_fine_reason (claim 1820).
import { collectProblems } from "../verify-lst-picker01-internal-fine-reason-inline-create.mjs";
export default {
  name: "lst-picker01-internal-fine-reason-inline-create",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-internal-fine-reason-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
