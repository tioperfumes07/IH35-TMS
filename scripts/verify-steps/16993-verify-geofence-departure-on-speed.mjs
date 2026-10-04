export default {
  name: "verify:geofence-departure-on-speed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofence-departure-on-speed.mjs"]);
  },
};
