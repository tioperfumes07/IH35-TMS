export default {
  name: "verify:integrity-alert-detail-action-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-integrity-alert-detail-action-company-lifecycle.mjs"]);
  },
};
