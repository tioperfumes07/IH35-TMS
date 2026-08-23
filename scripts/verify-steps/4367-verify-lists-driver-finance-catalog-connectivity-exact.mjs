export default {
  name: "verify:lists-driver-finance-catalog-connectivity-exact",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-driver-finance-catalog-connectivity-exact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-driver-finance-catalog-connectivity-exact.mjs"]);
  },
};
