// Maintenance VendorsPage AP vendor link search (claim 2114).
import { collectProblems } from "../verify-maint-vendors-ap-link-search.mjs";
export default {
  name: "maint-vendors-ap-link-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "maint-vendors-ap-link-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
