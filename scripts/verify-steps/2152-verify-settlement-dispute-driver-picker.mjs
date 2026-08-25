import { collectProblems } from "../verify-settlement-dispute-driver-picker.mjs";
export default {
  name: "settlement-dispute-driver-picker",
  run: async (ctx) => {
    const problems = collectProblems();
    if (problems.length) throw new Error(problems.join("\n"));
    await ctx.run("node", ["scripts/verify-settlement-dispute-evidence-chain.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlement-dispute-evidence-chain.mjs"]);
  },
};
