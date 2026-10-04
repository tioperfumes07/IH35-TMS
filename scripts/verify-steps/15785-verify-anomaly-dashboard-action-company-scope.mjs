export default {
  name: "verify:anomaly-dashboard-action-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-anomaly-dashboard-action-company-scope.mjs"]);
  },
};
