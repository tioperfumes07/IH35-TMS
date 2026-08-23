export default {
  name: "verify:driver-payment-methods-card-error-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-payment-methods-card-error-state.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-payment-methods-card-error-state.mjs"]);
  },
};
