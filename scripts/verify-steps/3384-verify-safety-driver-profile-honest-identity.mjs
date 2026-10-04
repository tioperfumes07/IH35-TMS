export default {
  name: "verify-safety-driver-profile-honest-identity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-driver-profile-honest-identity.mjs"]);
    // BANK-F91450 — C-57 Driver Profile Integrity + Complaints KPIs (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c57-driver-profile-integrity-kpis.mjs", "--selftest"]);
  },
};
