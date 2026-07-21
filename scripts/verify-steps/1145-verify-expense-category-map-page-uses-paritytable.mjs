export default {
  name: "verify:expense-category-map-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-category-map-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-expense-category-map-page-uses-paritytable.mjs"]);
  },
};
