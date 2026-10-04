export default {
  name: "verify:bill-payment-panel-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-payment-panel-labels.mjs"]);
  },
};
