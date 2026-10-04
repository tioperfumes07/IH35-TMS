export default {
  name: "verify:sales-tax-routes-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-sales-tax-routes-tenant-scope.mjs"]);
  },
};
