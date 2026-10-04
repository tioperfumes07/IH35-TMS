export default {
  name: "verify:anomaly-rule-seed-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-anomaly-rule-seed-company-lifecycle.mjs"]);
  },
};
