export default {
  name: "verify:customer-billing-summary-fail-closed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-billing-summary-fail-closed.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-billing-summary-fail-closed.mjs"]);
  },
};
