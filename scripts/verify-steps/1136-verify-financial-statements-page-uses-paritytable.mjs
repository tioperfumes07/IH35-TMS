export default {
  name: "verify:financial-statements-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-financial-statements-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-financial-statements-page-uses-paritytable.mjs"]);
  },
};
