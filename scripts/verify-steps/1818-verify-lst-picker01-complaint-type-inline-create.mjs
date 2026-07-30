// LST-PICKER-01 ComplaintsTab complaint_type (claim 1818).
import { collectProblems } from "../verify-lst-picker01-complaint-type-inline-create.mjs";
export default {
  name: "lst-picker01-complaint-type-inline-create",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-complaint-type-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
