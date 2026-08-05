// Fleet QuickAssign driver EntityPicker (claim 2468).
import { collectProblems } from "../verify-fleet-quick-assign-driver-entity-picker.mjs";

export default {
  name: "fleet-quick-assign-driver-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "fleet-quick-assign-driver-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
