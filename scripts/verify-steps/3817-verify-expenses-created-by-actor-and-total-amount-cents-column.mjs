export default {
  name: "verify-expenses-created-by-actor-and-total-amount-cents-column",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-expenses-created-by-actor-and-total-amount-cents-column.mjs"]);
  },
};
