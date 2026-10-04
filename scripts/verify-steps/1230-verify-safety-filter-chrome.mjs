/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-safety-filter-chrome",
  async run(ctx) {
    // BANK-F91511 — SafetyDashboardFilter leftover #475569 refuse (this EVEN already owns the guard).
    await ctx.run("node", ["scripts/verify-safety-filter-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-filter-chrome.mjs"]);
  },
};
