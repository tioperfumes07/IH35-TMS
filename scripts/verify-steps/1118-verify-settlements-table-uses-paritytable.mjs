export default {
  name: "verify:settlements-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlements-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlements-table-uses-paritytable.mjs"]);
  },
};
