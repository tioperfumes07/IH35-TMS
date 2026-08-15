export default {
  name: "verify-bill-payment-modal-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-payment-modal-parity-surface-bar.mjs"]);
  },
};
