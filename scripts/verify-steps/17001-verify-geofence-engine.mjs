export default {
  name: "verify:geofence-engine",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofence-engine.mjs"]);
  },
};
