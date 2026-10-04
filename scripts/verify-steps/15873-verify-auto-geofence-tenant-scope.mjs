export default {
  name: "verify:auto-geofence-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-auto-geofence-tenant-scope.mjs"]);
  },
};
