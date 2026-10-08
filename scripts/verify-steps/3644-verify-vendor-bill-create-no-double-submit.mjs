export default {
  name: "verify-vendor-bill-create-no-double-submit",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vendor-bill-create-no-double-submit.mjs"]);
    await ctx.run("node", ["scripts/verify-exhibits-drvqual-filings-slate-leftover-chrome.mjs"]);
  },
};
