export default {
  name: "verify:one-geofence-inside-decider",
  run(ctx) {
    ctx.run("node", ["scripts/verify-one-geofence-inside-decider.mjs"]);
  },
};
