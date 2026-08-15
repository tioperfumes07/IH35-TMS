export default {
  name: "verify-invoice-create-modal-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-create-modal-parity-surface-bar.mjs"]);
  },
};
