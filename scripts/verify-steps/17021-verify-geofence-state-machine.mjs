export default {
  name: "verify:geofence-state-machine",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofence-state-machine.mjs"]);
  },
};
