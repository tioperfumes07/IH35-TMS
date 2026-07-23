export default {
  name: "verify:payment-methods-catalog-create",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payment-methods-catalog-create.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-payment-methods-catalog-create.mjs"]);
  },
};
