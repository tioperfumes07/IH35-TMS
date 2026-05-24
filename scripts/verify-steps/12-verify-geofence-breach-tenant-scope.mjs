export default {
  name: "verify-geofence-breach-tenant-scope",
  run: async (ctx) => {
    if (ctx.run("node", ["scripts/verify-geofence-breach-tenant-scope.mjs"]) !== 0) {
      process.exit(1);
    }
  },
};
