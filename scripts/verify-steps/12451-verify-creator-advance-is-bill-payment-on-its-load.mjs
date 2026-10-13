export default {
  name: "verify:creator-advance-is-bill-payment-on-its-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-creator-advance-is-bill-payment-on-its-load.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-creator-advance-is-bill-payment-on-its-load.mjs"]);
  },
};
