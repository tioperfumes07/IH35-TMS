export default {
  name: "verify:medical-card-update-audit-failure-truth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-medical-card-update-audit-failure-truth.mjs"]);
  },
};
