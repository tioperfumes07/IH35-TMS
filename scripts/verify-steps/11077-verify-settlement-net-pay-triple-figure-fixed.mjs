export default {
  name: "verify:settlement-net-pay-triple-figure-fixed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-net-pay-triple-figure-fixed.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-net-pay-triple-figure-fixed.mjs"]);
  },
};
