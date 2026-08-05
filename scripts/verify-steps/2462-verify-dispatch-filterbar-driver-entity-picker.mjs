// Dispatch FilterBar driver EntityPicker (claim 2462).
import { collectProblems } from "../verify-dispatch-filterbar-driver-entity-picker.mjs";

export default {
  name: "dispatch-filterbar-driver-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "dispatch-filterbar-driver-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
