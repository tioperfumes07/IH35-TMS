// HosHistory driver search (claim 2132).
import { collectProblems } from "../verify-hos-history-driver-search.mjs";
export default {
  name: "hos-history-driver-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "hos-history-driver-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
