export default {
  name: "verify:cash-flow-driver-pay-no-silent-catch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-driver-pay-no-silent-catch.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-flow-driver-pay-no-silent-catch.mjs"]);
  },
};
