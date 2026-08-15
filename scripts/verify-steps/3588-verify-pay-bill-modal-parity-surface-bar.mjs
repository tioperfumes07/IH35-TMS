export default {
  name: "verify-pay-bill-modal-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pay-bill-modal-parity-surface-bar.mjs"]);
  },
};
