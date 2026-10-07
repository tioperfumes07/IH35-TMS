export default {
  name: "verify:safety-creator-pickers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-create-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-create-slate-leftover-chrome.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-creator-pickers.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-creator-pickers.mjs"]);
  },
};
