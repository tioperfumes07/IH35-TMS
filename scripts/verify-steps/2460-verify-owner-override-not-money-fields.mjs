export default {
  name: "verify-owner-override-not-money-fields",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-owner-override-not-money-fields.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-owner-override-not-money-fields.mjs"]);
  },
};
