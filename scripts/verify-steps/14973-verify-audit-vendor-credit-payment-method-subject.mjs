export default {
  name: "verify:audit-vendor-credit-payment-method-subject",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-vendor-credit-payment-method-subject.mjs"]);
  },
};
