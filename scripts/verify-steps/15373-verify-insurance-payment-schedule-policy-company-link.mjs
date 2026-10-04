export default {
  name: "verify:insurance-payment-schedule-policy-company-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-payment-schedule-policy-company-link.mjs"]);
  },
};
