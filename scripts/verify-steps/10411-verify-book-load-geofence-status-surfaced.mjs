export default {
  name: "verify-book-load-geofence-status-surfaced",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-book-load-geofence-status-surfaced.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-book-load-geofence-status-surfaced.mjs"]);
  },
};
