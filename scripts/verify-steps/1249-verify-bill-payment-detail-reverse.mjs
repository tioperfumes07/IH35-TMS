export default {
  name: "verify-bill-payment-detail-reverse",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-bill-payment-detail-reverse.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-bill-payment-detail-reverse.mjs", "--selftest"]);
  },
};
