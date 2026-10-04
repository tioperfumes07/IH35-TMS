export default {
  name: "verify:customer-invoice-customer-id-deeplink",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-invoice-customer-id-deeplink.mjs"]);
  },
};
