/** FUEL-08 — payment method drives company_direct credit (never hardcoded cash for fleet card). */
export default {
  name: "verify-fuel-payment-method-drives-credit",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-payment-method-drives-credit.mjs"]);
    await ctx.run("node", ["scripts/verify-fuel-payment-method-drives-credit.mjs", "--selftest"]);
  },
};
