export default {
  name: "verify-maint-home-bill-expense-wo-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-home-bill-expense-wo-link.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-maint-home-bill-expense-wo-link.mjs"]);
  },
};
