export default {
  name: "verify-reverse-profile-preview-all-row-access",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reverse-profile-preview-all-row-access.mjs"]);
    // BANK-F91451 — C-20 Driver Profile module shell (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c20-driver-profile-module.mjs", "--selftest"]);
    // BANK-F91145 piggy — LeaseContractCreator/TwoSectionLineEditor/KpiCard slate leftover refuse
    await ctx.run("node", ["scripts/verify-91145-lease-twosec-kpi-slate-leftover-chrome.mjs"]);
  },
};
