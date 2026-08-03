// BookLoad customer server search (claim 2118).
import { collectProblems } from "../verify-bookload-customer-server-search.mjs";
export default {
  name: "bookload-customer-server-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "bookload-customer-server-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
