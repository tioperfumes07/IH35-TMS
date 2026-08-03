// CreateTask + WarrantyClaims picker search (claim 2108).
import { collectProblems } from "../verify-create-task-warranty-picker-search.mjs";
export default {
  name: "create-task-warranty-picker-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "create-task-warranty-picker-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
