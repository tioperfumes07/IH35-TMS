export default {
  name: "verify:bank-tx-categorization-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-tx-categorization-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-tx-categorization-page-uses-paritytable.mjs"]);
  },
};
