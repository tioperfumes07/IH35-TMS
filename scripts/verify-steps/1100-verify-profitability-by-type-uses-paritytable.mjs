export default {
  name: "verify:profitability-by-type-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-profitability-by-type-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-profitability-by-type-uses-paritytable.mjs"]);
  },
};
