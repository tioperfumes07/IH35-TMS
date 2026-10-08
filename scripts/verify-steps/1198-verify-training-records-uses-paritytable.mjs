export default {
  name: "verify:training-records-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-training-records-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-training-records-uses-paritytable.mjs"]);
    // BANK leftover slate refuse piggyback (F91192)
    await ctx.run("node", ["scripts/verify-safety-train-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-train-slate-leftover-chrome.mjs"]);
  },
};
