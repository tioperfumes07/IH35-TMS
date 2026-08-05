// TireProgramPage EntityPicker kind=unit (claim 2424).
import { collectProblems } from "../verify-tire-program-unit-entity-picker.mjs";

export default {
  name: "tire-program-unit-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "tire-program-unit-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
