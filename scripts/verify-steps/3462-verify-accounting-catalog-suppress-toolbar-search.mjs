export default {
  name: "verify-accounting-catalog-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-accounting-catalog-suppress-toolbar-search.mjs"]);
    // BANK leftover refuse — BulkDemoPage / CustomerListSidebar / AuditTrailPage house tokens
    await ctx.run("node", ["scripts/verify-91280-bulk-cust-audit-slate-leftover-chrome.mjs"]);
  },
};
