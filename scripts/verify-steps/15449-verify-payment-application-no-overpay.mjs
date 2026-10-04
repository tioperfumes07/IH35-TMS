export default {
  name: "verify:payment-application-no-overpay",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payment-application-no-overpay.mjs"]);
  },
};
