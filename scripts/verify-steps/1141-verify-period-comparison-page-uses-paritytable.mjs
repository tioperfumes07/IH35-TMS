export default {
  name: "verify:period-comparison-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-period-comparison-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-period-comparison-page-uses-paritytable.mjs"]);
  },
};
