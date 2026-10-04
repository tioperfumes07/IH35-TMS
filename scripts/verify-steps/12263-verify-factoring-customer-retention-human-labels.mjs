export default {
  name: "verify:factoring-customer-retention-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-customer-retention-human-labels.mjs"]);
  },
};
