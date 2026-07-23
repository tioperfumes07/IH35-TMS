export default {
  name: "verify-acct-recurring-bill-wizard",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-recurring-bill-wizard.mjs"]);
  },
};
