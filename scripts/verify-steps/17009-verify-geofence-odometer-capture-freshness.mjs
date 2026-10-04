export default {
  name: "verify:geofence-odometer-capture-freshness",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofence-odometer-capture-freshness.mjs"]);
  },
};
