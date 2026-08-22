export default {
  name: "verify:invoice-send-customer-left-join",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-send-customer-left-join.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-invoice-send-customer-left-join.mjs"]);
  },
};
