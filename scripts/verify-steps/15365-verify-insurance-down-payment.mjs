export default {
  name: "verify:insurance-down-payment",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-down-payment.mjs"]);
  },
};
