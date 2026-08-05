// FactoringHome equipment-loan attribution load EntityPicker (claim 2436).
import { collectProblems } from "../verify-factoring-loan-load-entity-picker.mjs";

export default {
  name: "factoring-loan-load-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "factoring-loan-load-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
