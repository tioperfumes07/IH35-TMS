export default {
  name: "verify:audit-activity-module-alert-banking-label-resolver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-activity-module-alert-banking-label-resolver.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-audit-activity-module-alert-banking-label-resolver.mjs"]);
  },
};
