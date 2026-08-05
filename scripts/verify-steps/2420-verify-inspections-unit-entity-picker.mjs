// InspectionsPage EntityPicker kind=unit (claim 2420).
import { collectProblems } from "../verify-inspections-unit-entity-picker.mjs";

export default {
  name: "inspections-unit-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "inspections-unit-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
