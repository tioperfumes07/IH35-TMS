export default {
  name: "verify:samsara-vendor-mapping-actions-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-vendor-mapping-actions-tenant-scope.mjs"]);
  },
};
