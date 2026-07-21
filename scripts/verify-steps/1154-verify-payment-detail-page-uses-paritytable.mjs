export default {
  name: "verify:payment-detail-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payment-detail-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-payment-detail-page-uses-paritytable.mjs"]);
  },
};
