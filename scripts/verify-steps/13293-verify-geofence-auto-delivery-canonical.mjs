export default {
  name: "verify:geofence-auto-delivery-canonical",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofence-auto-delivery-canonical.mjs"]);
  },
};
