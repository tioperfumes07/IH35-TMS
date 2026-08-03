// Service + Item preferred vendor search (claim 2110).
import { collectProblems } from "../verify-service-item-preferred-vendor-search.mjs";
export default {
  name: "service-item-preferred-vendor-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "service-item-preferred-vendor-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
