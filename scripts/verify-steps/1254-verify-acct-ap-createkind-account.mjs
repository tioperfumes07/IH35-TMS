export default {
  name: "verify-acct-ap-createkind-account",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-ap-createkind-account.mjs"]);
  },
};
