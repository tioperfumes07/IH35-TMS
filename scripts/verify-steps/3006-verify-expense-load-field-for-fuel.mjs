export default {
  name: "verify-expense-load-field-for-fuel",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-expense-load-field-for-fuel.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-expense-load-field-for-fuel.mjs"]);
  },
};
