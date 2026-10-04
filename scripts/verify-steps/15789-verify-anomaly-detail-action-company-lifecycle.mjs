export default {
  name: "verify:anomaly-detail-action-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-anomaly-detail-action-company-lifecycle.mjs"]);
  },
};
