export default {
  name: "verify:profitability-by-customer-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-profitability-by-customer-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-profitability-by-customer-uses-paritytable.mjs"]);
  },
};
