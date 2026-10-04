export default {
  name: "verify:lawsuit-policy-customer-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lawsuit-policy-customer-human-labels.mjs"]);
  },
};
