// InlineUnitPicker EntityPicker kind=unit (claim 2418).
import { collectProblems } from "../verify-inline-unit-picker-entity-picker.mjs";

export default {
  name: "inline-unit-picker-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "inline-unit-picker-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
