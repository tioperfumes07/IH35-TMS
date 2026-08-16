import { collectProblems } from "../verify-inline-driver-picker-server-search.mjs";
export default {
  name: "inline-driver-picker-server-search",
  run: async (ctx) => {
    const problems = collectProblems();
    if (problems.length) throw new Error("inline-driver-picker-server-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "));
    await ctx.run("node", ["scripts/verify-driver-picker-duplicate-disambiguation.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-driver-picker-duplicate-disambiguation.mjs"]);
  },
};
