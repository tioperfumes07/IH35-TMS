export default {
  name: "verify:settlement-payment-state-guard",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-payment-state-guard.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-payment-state-guard.mjs"]);
  },
};
