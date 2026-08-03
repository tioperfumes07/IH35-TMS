export default {
  name: "verify-no-orphaned-form-owners",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-orphaned-form-owners.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-orphaned-form-owners.mjs"]);
  },
};
