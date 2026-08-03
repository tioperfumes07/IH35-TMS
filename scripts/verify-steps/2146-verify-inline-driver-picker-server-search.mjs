import { collectProblems } from "../verify-inline-driver-picker-server-search.mjs";
export default {
  name: "inline-driver-picker-server-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) throw new Error("inline-driver-picker-server-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "));
  },
};
