export default {
  name: "verify-parity-table-resize-affordance",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-parity-table-resize-affordance.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-parity-table-resize-affordance.mjs"]);
  },
};
