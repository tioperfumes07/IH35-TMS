export default {
  name: "verify:customer-shipping-country-nullable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-shipping-country-nullable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-shipping-country-nullable.mjs"]);
  },
};
