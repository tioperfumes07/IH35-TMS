export default {
  name: "verify:verify-customer-payments-applied",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-payments-applied.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-payments-applied.mjs"]);
  },
};
