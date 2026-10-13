export default {
  name: "verify:driver-pay-rounding-one-rule",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-pay-rounding-one-rule.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-pay-rounding-one-rule.mjs"]);
  },
};
