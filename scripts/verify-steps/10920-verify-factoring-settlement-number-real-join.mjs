export default {
  name: "verify-factoring-settlement-number-real-join",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-settlement-number-real-join.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-factoring-settlement-number-real-join.mjs"]);
  },
};
