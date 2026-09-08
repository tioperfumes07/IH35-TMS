export default {
  name: "verify-load-costs-return-columns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-costs-return-columns.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-costs-return-columns.mjs"]);
  },
};
