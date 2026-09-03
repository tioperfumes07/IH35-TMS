export default {
  name: "verify-mileage-g1-g5-live",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-mileage-g1-g5-live.mjs"]);
  },
};
