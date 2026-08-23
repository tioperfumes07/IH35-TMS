export default {
  name: "verify:lists-customer-vendor-catalog-connectivity-exact",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-customer-vendor-catalog-connectivity-exact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-customer-vendor-catalog-connectivity-exact.mjs"]);
  },
};
