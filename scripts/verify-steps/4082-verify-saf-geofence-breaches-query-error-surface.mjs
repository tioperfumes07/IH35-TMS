export default {
  name: "verify-saf-geofence-breaches-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-geofence-breaches-query-error-surface.mjs"]);
  },
};
