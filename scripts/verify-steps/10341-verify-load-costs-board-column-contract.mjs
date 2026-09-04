export default {
  name: "verify-load-costs-board-column-contract",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-costs-board-column-contract.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-costs-board-column-contract.mjs"]);
  },
};
