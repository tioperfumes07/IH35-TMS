// Onboarding unit EntityPicker (claim 2128).
import { collectProblems } from "../verify-onboarding-unit-entity-picker.mjs";
export default {
  name: "onboarding-unit-entity-picker",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "onboarding-unit-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
