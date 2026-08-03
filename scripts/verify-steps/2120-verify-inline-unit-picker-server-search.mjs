// InlineUnitPicker server search (claim 2120).
import { collectProblems } from "../verify-inline-unit-picker-server-search.mjs";
export default {
  name: "inline-unit-picker-server-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "inline-unit-picker-server-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
