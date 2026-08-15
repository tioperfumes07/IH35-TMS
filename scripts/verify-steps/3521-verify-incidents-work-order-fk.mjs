export default {
  name: "verify-incidents-work-order-fk",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-incidents-work-order-fk.mjs"]);
  },
};
