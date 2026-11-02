export default {
  name: "verify:customer-detail-billing-complete-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-detail-billing-complete-range.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-detail-billing-complete-range.mjs"]);
  },
};
