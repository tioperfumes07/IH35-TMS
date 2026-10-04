export default {
  name: "verify:settlement-payment-guc-order",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-payment-guc-order.mjs"]);
  },
};
