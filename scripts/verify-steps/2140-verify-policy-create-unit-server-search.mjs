// PolicyCreate unit server search (claim 2140).
import { collectProblems } from "../verify-policy-create-unit-server-search.mjs";
export default {
  name: "policy-create-unit-server-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "policy-create-unit-server-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
