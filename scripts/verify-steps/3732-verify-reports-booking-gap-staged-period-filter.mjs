export default {
  name: "verify-reports-booking-gap-staged-period-filter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-booking-gap-staged-period-filter.mjs"]);
  },
};
