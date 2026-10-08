export default {
  name: "verify-factoring-queue-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-queue-duplicate-search.mjs"]);
    // BANK leftover refuse — vendorCategories/SummaryCards/CollapsibleProfileCard house tokens
    await ctx.run("node", ["scripts/verify-vendor-summary-profile-slate-leftover-chrome.mjs"]);
  },
};
