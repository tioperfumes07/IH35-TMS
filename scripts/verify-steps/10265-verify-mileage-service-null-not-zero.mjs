export default {
  name: "verify-mileage-service-null-not-zero",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-mileage-service-null-not-zero.mjs"]);
  },
};
