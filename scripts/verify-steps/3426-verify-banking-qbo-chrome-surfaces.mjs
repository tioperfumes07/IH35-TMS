export default {
  name: "verify-banking-qbo-chrome-surfaces",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-qbo-chrome-surfaces.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91133-dispatch-planners-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91133-dispatch-planners-slate-leftover-chrome.mjs"]);
    return ctx.run("node", ["scripts/verify-banking-qbo-chrome-surfaces.mjs"]);
  },
};
