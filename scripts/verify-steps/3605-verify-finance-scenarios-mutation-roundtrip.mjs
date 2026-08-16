export default {
  name: "verify-finance-scenarios-mutation-roundtrip",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-scenarios-mutation-roundtrip.mjs"]);
  },
};
