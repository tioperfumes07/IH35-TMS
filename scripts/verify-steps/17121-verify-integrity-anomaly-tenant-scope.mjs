export default {
  name: "verify:integrity-anomaly-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-integrity-anomaly-tenant-scope.mjs"]);
  },
};
