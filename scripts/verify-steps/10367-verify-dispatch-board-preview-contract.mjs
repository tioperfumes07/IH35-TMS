export default {
  name: "verify-dispatch-board-preview-contract",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-board-preview-contract.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-board-preview-contract.mjs"]);
  },
};
