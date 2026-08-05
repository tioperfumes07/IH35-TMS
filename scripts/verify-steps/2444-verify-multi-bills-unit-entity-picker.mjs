// CreateMultipleBillsPage unit EntityPicker (claim 2444).
import { collectProblems } from "../verify-multi-bills-unit-entity-picker.mjs";

export default {
  name: "multi-bills-unit-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "multi-bills-unit-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
