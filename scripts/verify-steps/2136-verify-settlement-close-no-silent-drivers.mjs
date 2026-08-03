// Settlement close no silent drivers (claim 2136).
import { collectProblems } from "../verify-settlement-close-no-silent-drivers.mjs";
export default {
  name: "settlement-close-no-silent-drivers",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "settlement-close-no-silent-drivers FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
