export default {
  name: "verify:settlement-advances-geofence-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-advances-geofence-human-labels.mjs"]);
  },
};
