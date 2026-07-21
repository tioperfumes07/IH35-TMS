export default {
  name: "verify:accounting-catalog-list-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-catalog-list-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accounting-catalog-list-uses-paritytable.mjs"]);
  },
};
