export default {
  name: "verify:drug-test-update-audit-failure-truth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drug-test-update-audit-failure-truth.mjs"]);
  },
};
