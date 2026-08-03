// ClaimCreateModal picker search (claim 2122).
import { collectProblems } from "../verify-claim-create-picker-search.mjs";
export default {
  name: "claim-create-picker-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "claim-create-picker-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
