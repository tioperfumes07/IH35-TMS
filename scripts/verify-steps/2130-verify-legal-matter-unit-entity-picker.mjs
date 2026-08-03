// Legal matter unit EntityPicker (claim 2130).
import { collectProblems } from "../verify-legal-matter-unit-entity-picker.mjs";
export default {
  name: "legal-matter-unit-entity-picker",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "legal-matter-unit-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
