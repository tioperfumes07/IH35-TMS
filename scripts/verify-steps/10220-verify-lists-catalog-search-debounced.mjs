export default {
  name: "verify-lists-catalog-search-debounced",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-catalog-search-debounced.mjs"]);
    // BANK leftover slate refuse piggyback (F91189)
    await ctx.run("node", ["scripts/verify-catalog-activity-planner-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-catalog-activity-planner-slate-leftover-chrome.mjs"]);
    // BANK leftover slate refuse — catalogs/lists orphan-guard wiring (Devin-A batch-23)
    await ctx.run("node", ["scripts/verify-catalogs-lists-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-catalogs-lists-slate-leftover-chrome.mjs"]);
  },
};
