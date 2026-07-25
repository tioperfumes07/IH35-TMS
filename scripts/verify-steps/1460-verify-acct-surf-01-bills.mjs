export default {
  name: "verify-acct-surf-01-bills",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-surf-01-bills.mjs"]);
  },
};
