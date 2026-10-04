export default {
  name: "verify:payment-recording-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payment-recording-contract.mjs"]);
  },
};
