export default {
  name: "verify:telematics-shared-driver-reads",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-telematics-shared-driver-reads.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-telematics-shared-driver-reads.mjs"]);
    // BANK-F91459 — E-44 Stops + miles on unit/driver profile (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-e44-stops-miles-profile.mjs", "--selftest"]);
  },
};
