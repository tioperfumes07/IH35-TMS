export default {
  name: "verify-settlements-qbo-chrome-surfaces",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-qbo-chrome-surfaces.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlements-qbo-chrome-surfaces.mjs"]);
    // BANK leftover refuse — ValidationPanel / ReportCard / CategoryHoverNav house tokens
    return ctx.run("node", ["scripts/verify-91287-valid-report-catnav-slate-leftover-chrome.mjs"]);
  },
};
