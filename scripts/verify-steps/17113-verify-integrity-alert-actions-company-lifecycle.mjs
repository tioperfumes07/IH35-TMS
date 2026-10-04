export default {
  name: "verify:integrity-alert-actions-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-integrity-alert-actions-company-lifecycle.mjs"]);
  },
};
