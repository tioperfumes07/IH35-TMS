export default {
  name: "verify:catalog-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalog-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-catalog-table-uses-paritytable.mjs"]);
  },
};
