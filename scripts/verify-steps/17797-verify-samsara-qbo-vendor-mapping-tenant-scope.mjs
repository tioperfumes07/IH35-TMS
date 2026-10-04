export default {
  name: "verify:samsara-qbo-vendor-mapping-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-qbo-vendor-mapping-tenant-scope.mjs"]);
  },
};
