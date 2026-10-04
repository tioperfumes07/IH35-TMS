export default {
  name: "verify:qbo-sync-health-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-health-tenant-scope.mjs"]);
  },
};
