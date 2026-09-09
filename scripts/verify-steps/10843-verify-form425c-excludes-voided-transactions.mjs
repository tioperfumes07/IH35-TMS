export default {
  name: "verify-form425c-excludes-voided-transactions",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-form425c-excludes-voided-transactions.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-form425c-excludes-voided-transactions.mjs"]);
  },
};
