export default {
  name: "verify-permits-page-test-toast-provider",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-permits-page-test-toast-provider.mjs"]);
    // BANK leftover slate refuse piggyback (F91176)
    await ctx.run("node", ["scripts/verify-permits-idvr-complaints-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-permits-idvr-complaints-slate-leftover-chrome.mjs"]);
  },
};
