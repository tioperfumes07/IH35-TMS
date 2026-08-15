export default {
  name: "verify-surface-bar-modal-inventory",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-surface-bar-modal-inventory.mjs"]);
  },
};
