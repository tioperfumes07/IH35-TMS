export default {
  name: "verify-dispatch-board-awaiting-reconciliation",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-board-awaiting-reconciliation.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-board-awaiting-reconciliation.mjs"]);
  },
};
