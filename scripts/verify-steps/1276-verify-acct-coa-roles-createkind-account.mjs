export default {
  name: "verify-acct-coa-roles-createkind-account",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-coa-roles-createkind-account.mjs"]);
  },
};
