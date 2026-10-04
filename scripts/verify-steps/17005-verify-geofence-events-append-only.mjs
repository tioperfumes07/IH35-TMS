export default {
  name: "verify:geofence-events-append-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofence-events-append-only.mjs"]);
  },
};
