export default {
  name: "verify-qbo-item-expense-account-map",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-item-expense-account-map.mjs"]);
  },
};
