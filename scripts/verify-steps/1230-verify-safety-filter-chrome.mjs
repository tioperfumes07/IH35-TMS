/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-safety-filter-chrome",
  async run(ctx) {
    // BANK-F91511 — SafetyDashboardFilter leftover #475569 refuse (this EVEN already owns the guard).
    // BANK-F91521 — leftover inactive-pill border #cbd5e1 → house #E5E7EB.
    // BANK-F91532 — leftover Tailwind slate-* classes → house #4B5563.
    await ctx.run("node", ["scripts/verify-safety-filter-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-filter-chrome.mjs"]);
  },
};
