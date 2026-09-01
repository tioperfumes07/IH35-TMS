export default {
  name: "verify-col-05-money-column-triad",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-col-05-money-column-triad.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-col-05-money-column-triad.mjs"]);
  },
};
