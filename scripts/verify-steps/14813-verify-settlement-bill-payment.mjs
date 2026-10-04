export default {
  name: "verify:settlement-bill-payment",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-bill-payment.mjs"]);
  },
};
