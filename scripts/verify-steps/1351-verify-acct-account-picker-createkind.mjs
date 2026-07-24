export default {
  name: "verify-acct-account-picker-createkind",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-account-picker-createkind.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-account-picker-createkind.mjs"]);
  },
};
