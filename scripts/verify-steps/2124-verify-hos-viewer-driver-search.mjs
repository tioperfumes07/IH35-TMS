// HosViewer driver search (claim 2124).
import { collectProblems } from "../verify-hos-viewer-driver-search.mjs";
export default {
  name: "hos-viewer-driver-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "hos-viewer-driver-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
