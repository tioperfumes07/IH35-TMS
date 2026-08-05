// FactoringHome equipment-loan unit EntityPicker (claim 2434).
import { collectProblems } from "../verify-factoring-loan-unit-entity-picker.mjs";

export default {
  name: "factoring-loan-unit-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "factoring-loan-unit-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
