export default {
  name: "verify-safety-driver-profile-honest-identity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-driver-profile-honest-identity.mjs"]);
    // BANK-F91450 — C-57 Driver Profile Integrity + Complaints KPIs (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c57-driver-profile-integrity-kpis.mjs", "--selftest"]);
    // BANK leftover refuse — BackButton / SecondaryNavTabs / DocsHome house tokens
    await ctx.run("node", ["scripts/verify-91296-back-secnav-docs-slate-leftover-chrome.mjs"]);
  },
};
