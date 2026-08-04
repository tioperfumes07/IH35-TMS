// Reports RunnerFilters driver picker server search (claim 2300).
import { collectProblems } from "../verify-runner-filters-driver-search.mjs";
export default {
  name: "runner-filters-driver-search",
  run: async (ctx) => {
    await ctx.run("node", ["scripts/verify-runner-filters-driver-search.mjs", "--selftest"]);
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "runner-filters-driver-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
