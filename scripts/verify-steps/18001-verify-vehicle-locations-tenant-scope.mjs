export default {
  name: "verify:vehicle-locations-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-locations-tenant-scope.mjs"]);
  },
};
