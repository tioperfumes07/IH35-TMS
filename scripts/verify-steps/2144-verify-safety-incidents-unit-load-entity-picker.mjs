// SafetyIncidentsClusterSurface unit+load EntityPicker (claim 2144).
import { collectProblems } from "../verify-safety-incidents-unit-load-entity-picker.mjs";
export default {
  name: "safety-incidents-unit-load-entity-picker",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "safety-incidents-unit-load-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
