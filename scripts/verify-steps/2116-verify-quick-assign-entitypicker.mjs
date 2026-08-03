// QuickAssign EntityPicker + trailer search (claim 2116).
import { collectProblems } from "../verify-quick-assign-entitypicker.mjs";
export default {
  name: "quick-assign-entitypicker",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "quick-assign-entitypicker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
