export default {
  name: "verify-reverse-profile-preview-all-row-access",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reverse-profile-preview-all-row-access.mjs"]);
    // BANK-F91451 — C-20 Driver Profile module shell (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c20-driver-profile-module.mjs", "--selftest"]);
  },
};
