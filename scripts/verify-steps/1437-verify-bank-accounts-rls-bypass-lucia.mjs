export default {
  name: "verify-bank-accounts-rls-bypass-lucia",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-accounts-rls-bypass-lucia.mjs"]);
  },
};
