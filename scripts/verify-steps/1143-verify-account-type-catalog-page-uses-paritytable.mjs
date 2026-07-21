export default {
  name: "verify:account-type-catalog-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-account-type-catalog-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-account-type-catalog-page-uses-paritytable.mjs"]);
  },
};
