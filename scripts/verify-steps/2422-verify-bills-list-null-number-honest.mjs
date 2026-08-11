export default {
  name: "verify-bills-list-null-number-honest",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bills-list-null-number-honest.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bills-list-null-number-honest.mjs"]);
  },
};
