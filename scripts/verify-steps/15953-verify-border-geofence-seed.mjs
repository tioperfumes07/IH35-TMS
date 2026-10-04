export default {
  name: "verify:border-geofence-seed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-border-geofence-seed.mjs"]);
  },
};
