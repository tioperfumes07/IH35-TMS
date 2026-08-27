export default {
  name: "verify:cancellations-report-customer-label-resolver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cancellations-report-customer-label-resolver.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cancellations-report-customer-label-resolver.mjs"]);
  },
};
