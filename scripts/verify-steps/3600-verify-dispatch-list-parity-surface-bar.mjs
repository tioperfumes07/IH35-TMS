export default {
  name: "verify-dispatch-list-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-list-parity-surface-bar.mjs"]);
  },
};
