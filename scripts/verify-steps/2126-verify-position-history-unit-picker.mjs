// PositionHistory unit EntityPicker (claim 2126).
import { collectProblems } from "../verify-position-history-unit-picker.mjs";
export default {
  name: "position-history-unit-picker",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "position-history-unit-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
