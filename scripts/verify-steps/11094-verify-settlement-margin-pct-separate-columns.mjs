export default {
  name: "verify-settlement-margin-pct-separate-columns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-margin-pct-separate-columns.mjs"]);
  },
};
