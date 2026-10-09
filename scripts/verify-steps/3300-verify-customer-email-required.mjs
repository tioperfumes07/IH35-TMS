export default {
  name: "verify:customer-email-required",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-email-required.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-customer-email-required.mjs"]);
    // BANK-F91155 piggy — PredictiveAlerts/MaintVendors/DomainRibbon slate leftover refuse
    await ctx.run("node", ["scripts/verify-91155-pred-vend-ribbon-slate-leftover-chrome.mjs"]);
  },
};
