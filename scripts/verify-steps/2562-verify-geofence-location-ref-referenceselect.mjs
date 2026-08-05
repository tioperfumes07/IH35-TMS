export default {
  name: "verify:geofence-location-ref-referenceselect",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-geofence-location-ref-referenceselect.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-geofence-location-ref-referenceselect.mjs"]);
  },
};
