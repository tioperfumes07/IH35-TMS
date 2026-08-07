export default {
  name: "verify-cargo-claim-entity-pickers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cargo-claim-entity-pickers.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cargo-claim-entity-pickers.mjs"]);
  },
};
