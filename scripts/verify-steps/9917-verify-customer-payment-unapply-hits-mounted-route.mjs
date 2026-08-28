export default {
  name: "verify:customer-payment-unapply-hits-mounted-route",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-payment-unapply-hits-mounted-route.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-payment-unapply-hits-mounted-route.mjs"]);
  },
};
