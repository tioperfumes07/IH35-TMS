export default {
  name: "verify:bill-payment-inherits-sample-tag",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-payment-inherits-sample-tag.mjs"]);
  },
};
