export default {
  name: "verify-safety-driver-score-unit-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-driver-score-unit-entitylink.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-hos-score-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-hos-score-slate-leftover-chrome.mjs"]);
  },
};
