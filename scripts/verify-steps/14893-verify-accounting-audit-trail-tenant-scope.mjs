export default {
  name: "verify:accounting-audit-trail-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-audit-trail-tenant-scope.mjs"]);
  },
};
