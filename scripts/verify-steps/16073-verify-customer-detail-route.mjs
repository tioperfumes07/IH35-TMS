export default {
  name: "verify:customer-detail-route",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-detail-route.mjs"]);
  },
};
