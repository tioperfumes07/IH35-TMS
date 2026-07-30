// LST-PICKER-01 FineCreateModal civil_fine_type (claim 1812).
import { collectProblems } from "../verify-lst-picker01-civil-fine-type-inline-create.mjs";
export default {
  name: "lst-picker01-civil-fine-type-inline-create",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-civil-fine-type-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
