export default {
  name: "verify:billing-summary-route",
  run(ctx) {
    ctx.run("node", ["scripts/verify-billing-summary-route.mjs"]);
  },
};
