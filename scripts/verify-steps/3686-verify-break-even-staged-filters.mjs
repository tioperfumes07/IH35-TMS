export default {
  name: "verify-break-even-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-break-even-staged-filters.mjs"]);
    await ctx.run("node", ["scripts/verify-91069-batch-banksplit-receipts-slate-leftover-chrome.mjs"]);
  },
};
