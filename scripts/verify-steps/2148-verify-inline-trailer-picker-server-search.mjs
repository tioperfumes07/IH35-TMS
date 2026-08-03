import { collectProblems } from "../verify-inline-trailer-picker-server-search.mjs";
export default {
  name: "inline-trailer-picker-server-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) throw new Error("inline-trailer-picker-server-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "));
  },
};
