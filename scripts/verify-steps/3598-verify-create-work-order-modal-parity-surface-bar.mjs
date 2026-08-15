export default {
  name: "verify-create-work-order-modal-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-create-work-order-modal-parity-surface-bar.mjs"]);
  },
};
