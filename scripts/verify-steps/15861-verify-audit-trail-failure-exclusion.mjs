export default {
  name: "verify:audit-trail-failure-exclusion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-trail-failure-exclusion.mjs"]);
  },
};
