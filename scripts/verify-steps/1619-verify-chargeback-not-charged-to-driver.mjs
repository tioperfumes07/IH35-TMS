// 1619 — ND-C5-01: factoring chargebacks absorbed by company, never charged to the driver.
export default {
  name: "verify-chargeback-not-charged-to-driver",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-chargeback-not-charged-to-driver.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-chargeback-not-charged-to-driver.mjs"]);
  },
};
