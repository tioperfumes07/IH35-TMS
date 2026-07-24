export default {
  name: "verify-qbo-ar-payment-deposit-bridge",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-ar-payment-deposit-bridge.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-ar-payment-deposit-bridge.mjs"]);
  },
};
