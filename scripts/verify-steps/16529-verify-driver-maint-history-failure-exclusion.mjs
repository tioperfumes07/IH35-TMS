export default {
  name: "verify:driver-maint-history-failure-exclusion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-maint-history-failure-exclusion.mjs"]);
  },
};
