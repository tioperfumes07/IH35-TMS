export default {
  name: "verify-lst-picker01-payrun-payment-method-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-payrun-payment-method-inline-create.mjs"]);
  },
};
