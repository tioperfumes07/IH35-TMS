export default {
  name: "verify-dispatch-catalog-list-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-catalog-list-uses-paritytable.mjs"]);
    // BANK leftover slate refuse piggyback (F91191)
    await ctx.run("node", ["scripts/verify-cancel-dispatch-legal-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-cancel-dispatch-legal-slate-leftover-chrome.mjs"]);
  },
};
