// BookLoad equipment EntityPicker + trailer search (claim 2100).
import { collectProblems } from "../verify-bookload-equipment-entitypicker-search.mjs";
export default {
  name: "bookload-equipment-entitypicker-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "bookload-equipment-entitypicker-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
