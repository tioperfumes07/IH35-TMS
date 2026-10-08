export default {
  name: "verify:load-history-tab-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-history-tab-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-history-tab-uses-paritytable.mjs"]);
    // BANK leftover slate refuse piggyback (F91179)
    await ctx.run("node", ["scripts/verify-loadhist-ocr-planner-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-loadhist-ocr-planner-slate-leftover-chrome.mjs"]);
  },
};
