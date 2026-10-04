export default {
  name: "verify:geofence-ack-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofence-ack-company-lifecycle.mjs"]);
  },
};
