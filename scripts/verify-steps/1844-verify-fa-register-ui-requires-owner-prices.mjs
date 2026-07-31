export default {
  name: "verify-fa-register-ui-requires-owner-prices",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fa-register-ui-requires-owner-prices.mjs"]);
  },
};
