export default {
  name: "verify:calculator-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-calculator-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-calculator-page-uses-paritytable.mjs"]);
  },
};
