export default {
  name: "verify-driver-pay-rate-create-writes-billing-table",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-pay-rate-create-writes-billing-table.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-driver-pay-rate-create-writes-billing-table.mjs"]);
  },
};
