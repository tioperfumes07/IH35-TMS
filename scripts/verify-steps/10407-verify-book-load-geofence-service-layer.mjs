export default {
  name: "verify-book-load-geofence-service-layer",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-book-load-geofence-service-layer.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-book-load-geofence-service-layer.mjs"]);
  },
};
