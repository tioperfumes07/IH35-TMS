export default {
  name: "verify:customer-billing-endpoints",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-billing-endpoints.mjs"]);
  },
};
