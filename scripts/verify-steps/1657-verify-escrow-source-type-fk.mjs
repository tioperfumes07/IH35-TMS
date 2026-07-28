export default {
  name: "verify-escrow-source-type-fk",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-escrow-source-type-fk.mjs"]);
  },
};
