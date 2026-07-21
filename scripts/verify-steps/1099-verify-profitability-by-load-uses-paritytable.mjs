export default {
  name: "verify:profitability-by-load-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-profitability-by-load-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-profitability-by-load-uses-paritytable.mjs"]);
  },
};
