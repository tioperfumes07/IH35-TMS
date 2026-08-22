export default {
  name: "verify:factoring-chargeback-invoice-customer-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-chargeback-invoice-customer-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-chargeback-invoice-customer-reverse.mjs"]);
  },
};
