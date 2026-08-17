export default {
  name: "verify-reports-geofence-reconciliation-display-dates",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-geofence-reconciliation-display-dates.mjs"]);
  },
};
