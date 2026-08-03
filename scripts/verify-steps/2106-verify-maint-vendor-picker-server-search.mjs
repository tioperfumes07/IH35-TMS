// Maintenance vendor picker server search (claim 2106).
import { collectProblems } from "../verify-maint-vendor-picker-server-search.mjs";
export default {
  name: "maint-vendor-picker-server-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "maint-vendor-picker-server-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
