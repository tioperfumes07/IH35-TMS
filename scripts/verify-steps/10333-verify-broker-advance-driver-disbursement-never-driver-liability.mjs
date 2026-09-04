export default {
  name: "verify-broker-advance-driver-disbursement-never-driver-liability",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-broker-advance-driver-disbursement-never-driver-liability.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-broker-advance-driver-disbursement-never-driver-liability.mjs"]);
  },
};
