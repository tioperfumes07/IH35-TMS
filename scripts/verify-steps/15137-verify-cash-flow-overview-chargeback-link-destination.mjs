export default {
  name: "verify:cash-flow-overview-chargeback-link-destination",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-overview-chargeback-link-destination.mjs"]);
  },
};
