export default {
  name: "verify-bill-payment-form-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-payment-form-parity-surface-bar.mjs"]);
  },
};
