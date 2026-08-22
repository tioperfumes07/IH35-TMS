export default {
  name: "verify:payments-detail-customer-left-join",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payments-detail-customer-left-join.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-payments-detail-customer-left-join.mjs"]);
  },
};
