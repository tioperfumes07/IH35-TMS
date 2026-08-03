// CreateWO modal outside-vendor search (claim 2112).
import { collectProblems } from "../verify-createwo-modal-vendor-search.mjs";
export default {
  name: "createwo-modal-vendor-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "createwo-modal-vendor-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
