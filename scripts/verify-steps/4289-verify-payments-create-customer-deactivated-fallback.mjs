export default {
  name: "verify:payments-create-customer-deactivated-fallback",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payments-create-customer-deactivated-fallback.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-payments-create-customer-deactivated-fallback.mjs"]);
  },
};
