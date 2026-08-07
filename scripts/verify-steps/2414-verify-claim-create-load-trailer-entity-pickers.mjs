export default {
  name: "verify-claim-create-load-trailer-entity-pickers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-claim-create-load-trailer-entity-pickers.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-claim-create-load-trailer-entity-pickers.mjs"]);
  },
};
