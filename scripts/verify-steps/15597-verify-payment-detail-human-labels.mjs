export default {
  name: "verify:payment-detail-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payment-detail-human-labels.mjs"]);
  },
};
