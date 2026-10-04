export default {
  name: "verify:arriving-soon-serves-geofence-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-arriving-soon-serves-geofence-state.mjs"]);
  },
};
