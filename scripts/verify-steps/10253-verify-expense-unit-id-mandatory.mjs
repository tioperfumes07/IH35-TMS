export default {
  name: "verify-expense-unit-id-mandatory",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-expense-unit-id-mandatory.mjs"]);
  },
};
