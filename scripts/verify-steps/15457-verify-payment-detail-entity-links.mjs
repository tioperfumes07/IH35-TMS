export default {
  name: "verify:payment-detail-entity-links",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payment-detail-entity-links.mjs"]);
  },
};
