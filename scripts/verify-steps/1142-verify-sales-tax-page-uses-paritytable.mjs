export default {
  name: "verify:sales-tax-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-sales-tax-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-sales-tax-page-uses-paritytable.mjs"]);
  },
};
