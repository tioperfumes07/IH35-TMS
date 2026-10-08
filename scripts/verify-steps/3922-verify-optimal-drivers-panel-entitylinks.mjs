export default {
  name: "verify-optimal-drivers-panel-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-optimal-drivers-panel-entitylinks.mjs"]);
    await ctx.run("node", ["scripts/verify-dispatch-opt-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-opt-slate-leftover-chrome.mjs"]);
  },
};
