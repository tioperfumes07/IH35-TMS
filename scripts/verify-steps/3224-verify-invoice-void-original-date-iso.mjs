// verify-steps wrapper for scripts/verify-invoice-void-original-date-iso.mjs (ACCT-F5029, step 3224).
export default {
  name: "verify-invoice-void-original-date-iso",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-void-original-date-iso.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-invoice-void-original-date-iso.mjs"]);
    // BANK-F91156 piggy — TripPlan/HosRules/FuelCards slate leftover refuse
    await ctx.run("node", ["scripts/verify-91156-fuel-trip-hos-cards-slate-leftover-chrome.mjs"]);
  },
};
