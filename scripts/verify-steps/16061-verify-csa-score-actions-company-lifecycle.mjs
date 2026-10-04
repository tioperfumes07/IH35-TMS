export default {
  name: "verify:csa-score-actions-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-csa-score-actions-company-lifecycle.mjs"]);
  },
};
