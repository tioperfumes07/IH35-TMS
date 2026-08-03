// AutoDeduction no silent drivers (claim 2138).
import { collectProblems } from "../verify-auto-deduction-no-silent-drivers.mjs";
export default {
  name: "auto-deduction-no-silent-drivers",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "auto-deduction-no-silent-drivers FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
