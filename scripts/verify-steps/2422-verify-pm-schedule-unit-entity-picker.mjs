// PmSchedulePage EntityPicker kind=unit (claim 2422).
import { collectProblems } from "../verify-pm-schedule-unit-entity-picker.mjs";

export default {
  name: "pm-schedule-unit-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "pm-schedule-unit-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
