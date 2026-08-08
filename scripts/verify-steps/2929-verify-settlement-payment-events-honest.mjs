export default {
  name: "verify:settlement-payment-events-honest",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-payment-events-honest.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-payment-events-honest.mjs"]);
  },
};
