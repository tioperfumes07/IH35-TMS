export default {
  name: "verify:geofence-webhook-feeds-detector",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofence-webhook-feeds-detector.mjs"]);
  },
};
