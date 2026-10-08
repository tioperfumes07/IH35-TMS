export default {
  name: "verify:fleet-hos-board-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-hos-board-uses-paritytable.mjs"]);
    await ctx.run("node", ["scripts/verify-fleet-hos-board-uses-paritytable.mjs", "--selftest"]);
    // BANK leftover slate refuse piggyback (F91173)
    await ctx.run("node", ["scripts/verify-hos-docs-pool-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-hos-docs-pool-slate-leftover-chrome.mjs"]);
  },
};
