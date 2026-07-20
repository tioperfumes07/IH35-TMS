export default {
  name: "verify:cash-flow-driver-pay-populated",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-driver-pay-populated.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-flow-driver-pay-populated.mjs"]);
  },
};
