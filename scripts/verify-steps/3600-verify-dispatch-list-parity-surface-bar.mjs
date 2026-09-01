export default {
  name: "verify-dispatch-list-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-list-parity-surface-bar.mjs"]);
    await ctx.run("node", ["scripts/verify-dispatch-board-sections-and-columns.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-board-sections-and-columns.mjs"]);
  },
};
