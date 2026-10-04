export default {
  name: "verify:geofence-detector-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofence-detector-tenant-scope.mjs"]);
  },
};
