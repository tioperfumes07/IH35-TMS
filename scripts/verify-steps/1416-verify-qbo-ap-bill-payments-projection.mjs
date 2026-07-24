export default {
  name: "verify-qbo-ap-bill-payments-projection",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-ap-bill-payments-projection.mjs"]);
  },
};
