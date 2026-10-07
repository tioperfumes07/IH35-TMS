export default {
  name: "verify:safety-incidents-cluster-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-safety-cluster-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-safety-cluster-slate-leftover-chrome.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-incidents-cluster-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-incidents-cluster-uses-paritytable.mjs"]);
  },
};
