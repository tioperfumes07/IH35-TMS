// CreateMultipleBillsPage driver EntityPicker (claim 2446).
import { collectProblems } from "../verify-multi-bills-driver-entity-picker.mjs";

export default {
  name: "multi-bills-driver-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "multi-bills-driver-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
