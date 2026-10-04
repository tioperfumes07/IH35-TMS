export default {
  name: "verify:safety-geofence-breach-range-vertical",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-geofence-breach-range-vertical.mjs"]);
  },
};
