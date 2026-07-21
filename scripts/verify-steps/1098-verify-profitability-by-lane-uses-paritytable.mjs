export default {
  name: "verify:profitability-by-lane-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-profitability-by-lane-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-profitability-by-lane-uses-paritytable.mjs"]);
  },
};
