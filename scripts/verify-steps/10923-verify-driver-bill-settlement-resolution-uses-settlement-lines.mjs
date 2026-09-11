export default {
  name: "verify:driver-bill-settlement-resolution-uses-settlement-lines",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-bill-settlement-resolution-uses-settlement-lines.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-bill-settlement-resolution-uses-settlement-lines.mjs"]);
  },
};
