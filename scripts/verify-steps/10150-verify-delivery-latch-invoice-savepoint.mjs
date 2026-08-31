export default {
  name: "verify-delivery-latch-invoice-savepoint",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-delivery-latch-invoice-savepoint.mjs"]);
  },
};
