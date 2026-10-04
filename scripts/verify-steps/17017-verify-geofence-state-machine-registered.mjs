export default {
  name: "verify:geofence-state-machine-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofence-state-machine-registered.mjs"]);
  },
};
