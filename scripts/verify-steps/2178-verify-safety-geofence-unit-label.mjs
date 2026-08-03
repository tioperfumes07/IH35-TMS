export default {
  name: "verify-safety-geofence-unit-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-geofence-unit-label.mjs"]);
  },
};
