// SevereRepairOosTab Mark OOS EntityPicker kind=unit (claim 2426).
import { collectProblems } from "../verify-severe-oos-unit-entity-picker.mjs";

export default {
  name: "severe-oos-unit-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "severe-oos-unit-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
