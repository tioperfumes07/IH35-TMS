export default {
  name: "verify-payment-methods-catalog-mutation-onerror",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-payment-methods-catalog-mutation-onerror.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-payment-methods-catalog-mutation-onerror.mjs", "--selftest"]);
  },
};
