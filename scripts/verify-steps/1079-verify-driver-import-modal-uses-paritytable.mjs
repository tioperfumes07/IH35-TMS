export default {
  name: "verify:driver-import-modal-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-import-modal-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-driver-import-modal-uses-paritytable.mjs"]);
    // BANK leftover slate refuse piggyback (F91194)
    await ctx.run("node", ["scripts/verify-drv-late-expir-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-drv-late-expir-slate-leftover-chrome.mjs"]);
  },
};
