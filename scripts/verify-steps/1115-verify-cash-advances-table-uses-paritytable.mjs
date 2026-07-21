export default {
  name: "verify:cash-advances-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-advances-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-advances-table-uses-paritytable.mjs"]);
  },
};
