// CreateWO identification picker search (claim 2104).
import { collectProblems } from "../verify-createwo-identification-picker-search.mjs";
export default {
  name: "createwo-identification-picker-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "createwo-identification-picker-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
