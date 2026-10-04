export default {
  name: "verify:payment-qbo-integration-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payment-qbo-integration-human-labels.mjs"]);
  },
};
