export default {
  name: "verify:amortization-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-amortization-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-amortization-page-uses-paritytable.mjs"]);
  },
};
