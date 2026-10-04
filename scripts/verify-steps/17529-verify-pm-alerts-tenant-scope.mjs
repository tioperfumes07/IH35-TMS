export default {
  name: "verify:pm-alerts-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pm-alerts-tenant-scope.mjs"]);
  },
};
