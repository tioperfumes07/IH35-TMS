export default {
  name: "verify:dispatch-awaiting-unassigned-not-uuid",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-awaiting-unassigned-not-uuid.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-awaiting-unassigned-not-uuid.mjs"]);
    // BANK-F91154 piggy — DriverCatalogBanner/DomainCatalogHub/ListsHub slate leftover refuse
    await ctx.run("node", ["scripts/verify-91154-lists-banner-hub-slate-leftover-chrome.mjs"]);
  },
};
