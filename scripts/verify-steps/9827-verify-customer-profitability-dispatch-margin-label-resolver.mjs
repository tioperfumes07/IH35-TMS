export default {
  name: "verify:customer-profitability-dispatch-margin-label-resolver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-profitability-dispatch-margin-label-resolver.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-profitability-dispatch-margin-label-resolver.mjs"]);
  },
};
