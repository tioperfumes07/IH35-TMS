import { collectProblems } from "../verify-contract-creator-customer-search.mjs";
export default {
  name: "contract-creator-customer-search",
  async run(ctx) {
    const problems = collectProblems();
    if (problems.length) throw new Error(problems.join("\n"));
    await ctx.run("node", ["scripts/verify-drv-tasks-legal-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-drv-tasks-legal-slate-leftover-chrome.mjs"]);
  },
};
